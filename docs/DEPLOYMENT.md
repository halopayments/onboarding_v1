# Deployment

## Local
- Run server on 4000
- Run web on 5173 with Vite proxy `/api -> http://localhost:4000`

## Production model
Recommended:
- Serve web static build via Nginx or same Node server
- Put API behind HTTPS (required for WhatsApp media URLs and security)

## Required ENV (server/.env)

# Server
PORT=4000
PUBLIC_BASE_URL=

# Email
SMTP_HOST=smtp-relay.gmail.com
SMTP_PORT=587
EMAIL_FROM=

# Internal recipients (comma-separated)
RECIPIENTS=

# Drive (either JSON string OR path)
DRIVE_SA_JSON={"type":"service_account",...}   # JSON string
# OR
DRIVE_SA_PATH=                # file path to JSON
DRIVE_ROOT_FOLDER_ID=                          # optional
DRIVE_MAKE_PUBLIC=false                        # recommended false

# Monday.com
MONDAY_API_KEY=xxxxxxxx
MONDAY_BOARD_ID=

# WhatsApp (Twilio)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
WHATSAPP_FROM=whatsapp:
WHATSAPP_NOTIFY_TO=whatsapp:+1XXXXXXXXXX,whatsapp:+1YYYYYYYYYY
