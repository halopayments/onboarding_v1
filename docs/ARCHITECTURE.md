
---

# 2) `docs/ARCHITECTURE.md`

```md
# Architecture

## Overview

Two services:
- **Web (React/Vite)**: Multi-step merchant application form, document upload, consent-gated OCR prefill, signature capture, success page.
- **Server (Express)**: OCR endpoint, submission endpoint, PDF generation and merge, persistence (in-memory for now), email notifications, optional Drive upload / WhatsApp / Monday updates.

## Frontend Modules

- `pages/MerchantForm.tsx`
  - 4-step flow:
    1) Upload documents + consent
    2) Business
    3) Principal + Banking
    4) Additional + Signature
  - Uploads are converted to Data URLs and sent to server for OCR and submit.
  - Signature captured via `react-signature-canvas`.
  - Prefill limited to 3 clicks per session.

- `pages/Success.tsx`
  - Loads `/api/submission/:appId`
  - Download button calls `/api/submission/:appId/pdf`
  - Confetti animation and redirect timer

## Backend Modules

- `server.ts`
  - `/api/extract`:
    - Requires all 3 docs
    - If consent=false returns empty extracted data
    - If consent=true calls OCR logic, returns structured JSON fields
  - `/api/submit`:
    - Requires all 3 docs
    - Generates application PDF, converts uploads to PDFs, merges order:
      Application → Photo ID → Check/Letter → W-9
    - Stores submission metadata in memory
    - Sends internal + merchant email
    - Optional: Drive upload, WhatsApp notify, Monday item

- `pdfgen.ts`
  - Generates the application PDF
  - Converts data URLs to PDF
  - Merges PDF buffers in order

- `cloudstorage.ts`
  - Google Drive upload (optional)
  - Creates Year/Month/Date folder structure
  - Uploads merged PDF into correct folder

- `whatsapp.ts`
  - Sends WhatsApp notifications (optional)
  - Can send a media URL if publicly accessible HTTPS

- `monday.ts`
  - Creates or updates Monday.com item using `MONDAY_BOARD_ID`

## Persistence Model

Currently in-memory `Map`:
- `appId`, `businessName`, `ownerName`, `createdAtISO`, `pdfBuffer`, optional `drive` info

Future: swap with DB (Postgres) or object storage.
