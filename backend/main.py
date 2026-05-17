import os
import re
import numpy as np
import torch
import torch.nn as nn
import joblib
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from transformers import AutoTokenizer, AutoModel
import warnings

warnings.filterwarnings("ignore")

# spam indicators
URGENCY = ['urgent', 'limited', 'expires', 'act now', 'immediately', 'today only', 'hurry']
FINANCIAL = ['free', 'guaranteed', 'earn', 'cash', 'prize', 'winner', 'discount',
             'offer', 'credit', 'loan', 'mortgage', 'investment', 'profit', 'income']
PHISHING = ['verify', 'confirm', 'account', 'suspended', 'unusual activity',
            'click here', 'login', 'update your', 'secure your', 'validate']

URL_RE = re.compile(r'https?://\S+|www\.\S+')
PRICE_RE = re.compile(r'\$[\d,]+|\d+%\s*off')
HTML_TAG = re.compile(r'<[^>]+>')
MULTI_SPACE = re.compile(r'\s+')


def char_entropy(text: str) -> float:
    if not text:
        return 0.0
    freq = np.array([text.count(c) for c in set(text)], dtype=float)
    freq /= freq.sum()
    return float(-np.sum(freq * np.log2(freq + 1e-9)))


def word_repetition_score(text: str) -> float:
    words = re.findall(r'\b\w+\b', text.lower())
    if len(words) < 2:
        return 0.0
    return 1.0 - len(set(words)) / len(words)


def extract_features(text: str) -> list:
    lower = text.lower()
    chars = len(text) or 1
    urls = URL_RE.findall(text)
    words = re.findall(r'\b\w+\b', text)
    html_tags = HTML_TAG.findall(text)
    
    features = {
        'caps_ratio': sum(c.isupper() for c in text) / chars,
        'exclamation_count': text.count('!'),
        'has_url': int(len(urls) > 0),
        'num_urls': len(urls),
        'has_unsubscribe': int('unsubscribe' in lower or 'opt-out' in lower),
        'has_price_pattern': int(bool(PRICE_RE.search(text))),
        'urgency_word_count': sum(1 for w in URGENCY if w in lower),
        'financial_word_count': sum(1 for w in FINANCIAL if w in lower),
        'phishing_word_count': sum(1 for w in PHISHING if w in lower),
        'digit_ratio': sum(c.isdigit() for c in text) / chars,
        'html_tag_density': len(html_tags) / (len(words) or 1),
        'word_repetition': word_repetition_score(text),
        'char_entropy': char_entropy(text[:500]),
        'avg_word_length': (sum(len(w) for w in words) / len(words)) if words else 0.0,
        'question_mark_count': text.count('?'),
    }
    return list(features.values())


def clean_text(text: str) -> str:
    text = HTML_TAG.sub(' ', text)
    text = URL_RE.sub(' <URL> ', text)
    text = re.sub(r'[^\x00-\x7F]+', ' ', text)  # remove non-ascii
    text = MULTI_SPACE.sub(' ', text)
    return text.strip()


def head_tail_text(text: str, head_chars=600, tail_chars=400) -> str:
    if len(text) <= head_chars + tail_chars:
        return text
    return text[:head_chars] + ' ... ' + text[-tail_chars:]


# Model definition
NUM_FEATURES = 15


class HybridSpamClassifier(nn.Module):
    def __init__(self, encoder, hidden_size=768, num_features=NUM_FEATURES,
                 proj_dim=64, head_dims=None, dropout=0.2):
        super().__init__()
        if head_dims is None:
            head_dims = [256, 128]
        
        self.encoder = encoder
        self.feature_proj = nn.Sequential(
            nn.Linear(num_features, proj_dim),
            nn.LayerNorm(proj_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
        )
        
        dims = [hidden_size + proj_dim] + head_dims + [2]
        layers = []
        for i in range(len(dims) - 1):
            layers.append(nn.Linear(dims[i], dims[i + 1]))
            if i < len(dims) - 2:
                layers += [nn.LayerNorm(dims[i + 1]), nn.ReLU(), nn.Dropout(dropout)]
        self.classifier = nn.Sequential(*layers)

    def forward(self, input_ids, attention_mask, features):
        cls = self.encoder(
            input_ids=input_ids,
            attention_mask=attention_mask
        ).last_hidden_state[:, 0, :]
        
        combined = torch.cat([cls, self.feature_proj(features)], dim=1)
        return self.classifier(combined)


# Load model at startup
MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
MODEL_PATH = os.path.join(MODELS_DIR, "hybrid_spam_model.pt")
SCALER_PATH = os.path.join(MODELS_DIR, "scaler.joblib")

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

print("Loading tokenizer...")
tokenizer = AutoTokenizer.from_pretrained("roberta-base")

print("Loading encoder...")
encoder = AutoModel.from_pretrained("roberta-base")

model = HybridSpamClassifier(encoder=encoder).to(device)
state = torch.load(MODEL_PATH, map_location=device)
model.load_state_dict(state)
model.eval()

print("Loading scaler...")
scaler = joblib.load(SCALER_PATH)
print("Ready to go")

# FastAPI setup
app = FastAPI(title="Spam Detector API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class EmailRequest(BaseModel):
    text: str


class PredictionResponse(BaseModel):
    label: str
    spam_probability: float
    ham_probability: float


@app.post("/predict", response_model=PredictionResponse)
def predict(req: EmailRequest):
    if not req.text or not req.text.strip():
        raise HTTPException(status_code=422, detail="Email text cannot be empty.")

    raw_text = req.text

    # Extract and scale hand-crafted features
    raw_feats = np.array(extract_features(raw_text), dtype=np.float32).reshape(1, -1)
    scaled_feats = scaler.transform(raw_feats).astype(np.float32)

    # Clean and tokenize
    enc_text = head_tail_text(clean_text(raw_text))
    encoding = tokenizer(
        enc_text,
        max_length=256,
        padding="max_length",
        truncation=True,
        return_tensors="pt",
    )

    input_ids = encoding["input_ids"].to(device)
    attention_mask = encoding["attention_mask"].to(device)
    features_t = torch.tensor(scaled_feats).to(device)

    with torch.no_grad():
        logits = model(input_ids, attention_mask, features_t)
        probs = torch.softmax(logits, dim=1).cpu().numpy()[0]

    ham_prob = float(probs[0])
    spam_prob = float(probs[1])
    label = "SPAM" if spam_prob >= 0.5 else "HAM"

    return PredictionResponse(
        label=label,
        spam_probability=round(spam_prob, 4),
        ham_probability=round(ham_prob, 4),
    )


@app.get("/health")
def health():
    return {"status": "ok"}
