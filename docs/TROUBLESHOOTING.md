
---

# 6) `docs/TROUBLESHOOTING.md`

```md
# Troubleshooting

## Cannot POST /api/extract
- Server not running
- Vite proxy misconfigured
- Confirm:
  - `GET /api/health` returns ok
  - Vite proxy points to correct IP/host

## Prefill says complete but no fields fill
- Server returned empty extracted fields due to JSON parse failure
- Check server logs for OCR raw output and parsing
- Ensure OCR returns ONLY JSON

## Google Drive: "File not found: <folder_id>"
- Folder ID must be the Drive folder ID, not a URL fragment
- Confirm service account has access to that Drive/shared drive

## gdrive.json invalid JSON
- `DRIVE_SA_JSON` expects raw JSON content, not a file path
- If using a file path, use `DRIVE_SA_PATH=./gdrive.json`

## Email not sending
- SMTP relay requires network access to port 587
- If running locally, ensure firewall allows outbound 587
