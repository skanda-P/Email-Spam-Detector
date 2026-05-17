# Spam Guard – Email Spam Detector

A Chrome extension + backend service that scans emails in Gmail and Outlook.
Uses a hybrid AI model (RoBERTa + custom features) to detect spam.

```
spam_detector/
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── models/
│       ├── hybrid_spam_model.pt
│       └── scaler.joblib
└── extension/
    ├── manifest.json
    ├── popup.html
    ├── popup.js
    ├── content.js
    └── icons/
```

## Getting Started

### Backend Setup

### Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

(If using CUDA, install PyTorch first from https://pytorch.org/get-started/locally/)

### Add Model Files

Place your trained model files in `backend/models/`:
- `hybrid_spam_model.pt`
- `scaler.joblib`

### Start the Server

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000
```

You should see the model loading messages and then:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

Test it with:
```bash
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{"text":"Congratulations! You won a free iPhone. Click now!"}'
```

## Chrome Extension Setup

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `spam_check/extension/` folder
5. The **Spam Shield** icon appears in your toolbar

## Using the Extension

1. Open **Gmail** or **Outlook** in your browser
2. Open an email
3. Click the extension icon in your toolbar
4. Hit **⚡ Scan Email**

The extension reads the email content and sends it to your backend server.
You'll see a result showing whether it's spam or legitimate, plus confidence scores.

## API

### POST `/predict`

Send email text for analysis:
```json
{ "text": "email content here" }
```

Response:
```json
{
  "label": "SPAM",
  "spam_probability": 0.97,
  "ham_probability": 0.03
}
```

### GET `/health`

Simple health check: returns `{"status": "ok"}`

## Configuration

The extension saves your API endpoint URL. If your backend is on a different server,
open the popup, update the **API URL** field, and save.

## Supported Clients

- Gmail (`mail.google.com`)
- Outlook web (`outlook.live.com`, `outlook.office.com`)
