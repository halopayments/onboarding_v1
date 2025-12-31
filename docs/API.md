# API

Base: `http://localhost:4000`

## Health
GET `/api/health`
Response: `{ "ok": true }`

## OCR Prefill
POST `/api/extract`
Body:
```json
{
  "consent": true,
  "idImageDataUrl": "data:image/png;base64,...",
  "checkImageDataUrl": "data:image/png;base64,...",
  "w9ImageDataUrl": "data:image/png;base64,..."
}
