# Production Checklist

## Required Before Go-Live

- Rotate every key that was ever placed in a local `.env` file or shared in chat/screenshots.
- Set `NODE_ENV=production`.
- Use strong unique values for:
  - `JWT_SECRET`
  - `TOKEN_ENCRYPTION_KEY`
  - `GUPSHUP_API_KEY`
  - `GUPSHUP_ONBOARDING_SECRET`
  - payment keys if subscriptions are enabled
- Set public URLs:
  - `APP_BASE_URL=https://api.yourdomain.com`
  - `FRONTEND_URL=https://app.yourdomain.com`
  - `CORS_ORIGINS=https://app.yourdomain.com`
- Keep `BROADCAST_ALLOW_FREEFORM=false` so broadcasts only use approved WhatsApp templates.
- Use `WHATSAPP_SEND_ENABLED=false` in staging if you want dry-run sending.

## WhatsApp Setup

- Configure Gupshup/Meta callback URL to:
  - `https://api.yourdomain.com/api/whatsapp/onboarding/callback`
- Configure inbound webhook URL to:
  - `https://api.yourdomain.com/api/webhook/whatsapp`
- Submit starter templates for approval before enabling broadcasts.
- Verify each school maps to exactly one `WhatsAppAccount` document.

## Security

- Run MongoDB Atlas with IP allowlisting or private networking.
- Do not expose API keys in frontend code.
- Keep token storage encrypted through `TOKEN_ENCRYPTION_KEY`.
- Confirm all school-owned records are queried with `schoolId`.
- Enable HTTPS only at the load balancer/platform.
- Keep server logs out of public storage.

## Operations

- Move broadcast processing to a durable queue before high-volume sending.
- Add backup and restore policy for MongoDB.
- Add monitoring for:
  - webhook failures
  - broadcast failure rate
  - message send latency
  - onboarding callback errors
- Add alerting for high failed-message rate to protect WhatsApp quality rating.
