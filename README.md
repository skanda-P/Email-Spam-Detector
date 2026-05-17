# Spam Shield – End-to-End Email Spam Detector

A Chrome extension + FastAPI backend that classifies open emails as **SPAM** or **HAM**
using your trained `HybridSpamClassifier` (RoBERTa + hand-crafted features).

```
spam_check/
├── backend/
│   ├── main.py            ← FastAPI app
│   ├── requirements.txt
│   └── models/            ← put your .pt and .joblib files here
│       ├── hybrid_spam_model.pt
│       └── scaler.joblib
└── extension/
    ├── manifest.json
    ├── content.js          ← extracts email text from Gmail / Outlook
    ├── popup.html
    ├── popup.js
    └── icons/
```

---

## 1  Backend Setup

### 1.1  Install dependencies

```bash
cd spam_check/backend
pip install -r requirements.txt
```

> **PyTorch note:** if you need a specific CUDA version, install it first from
> https://pytorch.org/get-started/locally/ before running the line above.

### 1.2  Place your model files

Copy your trained files into `backend/models/`:

```
backend/models/hybrid_spam_model.pt   ← from D:\spam_check\models\
backend/models/scaler.joblib          ← from D:\spam_check\models\
```

### 1.3  Start the server

```bash
cd spam_check/backend
uvicorn main:app --host 0.0.0.0 --port 8000
```

You should see:
```
[startup] Loading tokenizer …
[startup] Loading encoder …
[startup] Building model …
[startup] Loading weights …
[startup] Loading scaler …
[startup] Ready ✓
INFO:     Uvicorn running on http://0.0.0.0:8000
```

Verify it works:
```bash
curl -X POST http://localhost:8000/predict \
     -H "Content-Type: application/json" \
     -d '{"text":"Congratulations! You won a free iPhone. Click now!"}'
```

---

## 2  Chrome Extension Setup

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `spam_check/extension/` folder
5. The **Spam Shield** icon appears in your toolbar

---

## 3  Using the Extension

1. Open **Gmail** or **Outlook** in a tab
2. Open any email (click it to read it)
3. Click the **Spam Shield** toolbar icon
4. Press **🔍 Scan This Email**

The extension extracts the email text, sends it to your local backend, and shows:

| Result | Meaning |
|--------|---------|
| 🚨 **SPAM DETECTED** | Model is confident this is spam |
| ✅ **LOOKS SAFE** | Model classifies it as legitimate |

Probability bars show the confidence for each class.

---

## 4  API Reference

### `POST /predict`

**Request body:**
```json
{ "text": "<full email body>" }
```

**Response:**
```json
{
  "label": "SPAM",
  "spam_probability": 0.9732,
  "ham_probability":  0.0268
}
```

### `GET /health`
Returns `{"status": "ok"}` when the server is running.

---

## 5  Changing the API endpoint

If you run the backend on a different host/port (e.g. a remote server), click the
extension icon and update the **API Endpoint** field at the top of the popup.
The value is saved automatically.

---

## 6  Supported Email Clients

| Client | URL |
|--------|-----|
| Gmail  | `https://mail.google.com` |
| Outlook (web) | `https://outlook.live.com` or `https://outlook.office.com` |
