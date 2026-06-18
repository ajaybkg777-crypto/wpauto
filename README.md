# Wpauto - WhatsApp Automation Platform

Production-ready WhatsApp automation dashboard for schools and businesses. It includes Meta WhatsApp Cloud API integration, contacts/CRM, broadcasts, templates, automation flows, chatbot replies, live chat, analytics, and media storage.

## Main Features

- Meta WhatsApp Cloud API connection
- WhatsApp template builder with media header support
- Broadcast campaign builder with delivery/failure analytics
- Contact import, search, filters, export, and bulk delete
- Live chat inbox for WhatsApp conversations
- Automation/chatbot flow tools
- Cloudinary media upload support
- MongoDB Atlas database support
- Vercel frontend and Render backend deployment ready

## Tech Stack

Backend:
- Node.js
- Express
- MongoDB / Mongoose
- JWT authentication
- Meta WhatsApp Cloud API
- Cloudinary media uploads

Frontend:
- React 18
- Vite
- Tailwind CSS
- Axios
- Framer Motion

## Local Setup

### Backend

```bash
cd backend
npm install
cp .env.example .env
npm run start
```

Backend runs on:

```text
http://localhost:5000
```

Required backend environment variables:

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_long_random_secret
TOKEN_ENCRYPTION_KEY=your_long_random_secret
FRONTEND_URL=http://localhost:5173
APP_BASE_URL=http://localhost:5000

META_GRAPH_API_VERSION=v25.0
META_APP_ID=your_meta_app_id
META_APP_SECRET=your_meta_app_secret
META_CONFIG_ID=your_meta_embedded_signup_config_id
META_VERIFY_TOKEN=your_webhook_verify_token
META_SYSTEM_USER_ACCESS_TOKEN=your_meta_system_user_token
META_PHONE_NUMBER_ID=your_meta_phone_number_id
META_WABA_ID=your_meta_waba_id

CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Frontend runs on:

```text
http://localhost:5173
```

Frontend environment:

```env
VITE_API_URL=http://localhost:5000/api
VITE_AUTH_OTP_REQUIRED=false
```

## Deployment

### Backend on Render

Use the included `render.yaml`, or create a Render Web Service manually:

- Root directory: `backend`
- Build command: `npm install`
- Start command: `npm run start`
- Health check path: `/api/health`

Set all backend environment variables in Render. For production:

```env
NODE_ENV=production
APP_BASE_URL=https://your-render-backend.onrender.com
FRONTEND_URL=https://your-vercel-frontend.vercel.app
CORS_ORIGINS=https://your-vercel-frontend.vercel.app
ENABLE_SCHEDULER=true
```

### Frontend on Vercel

Vercel settings:

- Root directory: `frontend`
- Build command: `npm run build`
- Output directory: `dist`

Set:

```env
VITE_API_URL=https://your-render-backend.onrender.com/api
VITE_AUTH_OTP_REQUIRED=false
```

## Meta Webhook

In Meta Developers / WhatsApp configuration, use:

```text
Callback URL: https://your-render-backend.onrender.com/api/webhook/whatsapp
Verify Token: same value as META_VERIFY_TOKEN
```

Subscribe to WhatsApp webhook fields needed for messages and statuses.

## Important Notes

- Never commit `backend/.env` or `frontend/.env`.
- Use MongoDB Atlas IP allowlist or `0.0.0.0/0` only if you understand the risk.
- For image/video/document WhatsApp templates, upload media through the app so a Meta media sample handle is generated.
- Broadcast `sent` means Meta accepted the request. `delivered` means the message reached the user's phone. `read` means the user opened it.
- Meta can block messages because of quality, spam rate, invalid numbers, or user engagement rules. This is not always a code issue.

## Login

Default local admin comes from your backend `.env`:

```env
ADMIN_EMAIL=admin@waauto.com
ADMIN_PASSWORD=replace-with-a-strong-private-password
```

## Useful Commands

```bash
# Backend syntax check
node --check backend/server.js

# Frontend build
cd frontend
npm run build
```

## Repository Safety

Ignored by git:

- `.env`
- `node_modules`
- logs
- `backend/uploads`
- `frontend/dist`
