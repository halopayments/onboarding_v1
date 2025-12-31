
---

# 4) `docs/SECURITY.md`

```md
# Security & PII Handling

## PII Collected
- Owner SSN (entered manually)
- Owner DOB
- Government ID
- Bank account/routing (from merchant input and/or check OCR)
- W-9 (stored as attachment, not used to OCR SSN/EIN)

## Consent & OCR
- OCR is performed only if user checks explicit consent.
- If consent=false, OCR endpoint returns empty data.

## Data Storage
- Production recommendation:
  - Do not store PII in logs
  - Store PDFs encrypted at rest
  - Use short retention windows if possible
  - Restrict Drive folder permissions

## Masking in PDF
- Account number masked except last 4
- SSN policy:
  - If business requirement is “show SSN fully”, do so
  - Otherwise recommended to mask SSN (SOC2 safer)

## Rate limiting
- API rate-limited per IP.

## Secrets
- `.env` is never committed
- `gdrive.json` must not be committed
