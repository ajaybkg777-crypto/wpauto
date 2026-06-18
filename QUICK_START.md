# Quick Start Guide

## 5-Minute Setup

### 1. Backend Setup

```bash
cd backend
npm install
```

**Copy `.env.example` to `.env` and fill in:**
```
PORT=5000
NODE_ENV=development
MONGODB_URI=your-mongodb-atlas-connection-string
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_EXPIRE=7d

# Razorpay (Get from https://dashboard.razorpay.com)
RAZORPAY_KEY_ID=rzp_test_XXXXXXXXX
RAZORPAY_KEY_SECRET=XXXXXXXXX

# GupShup WhatsApp (Get from https://gupshup.io)
GUPSHUP_BASE_URL=https://api.gupshup.io
GUPSHUP_ONBOARDING_URL=http://localhost:5000/api/webhook/whatsapp
GUPSHUP_API_KEY=your_gupshup_api_key
GUPSHUP_APP_NAME=your_app_name

FRONTEND_URL=http://localhost:5173
APP_BASE_URL=http://localhost:5000
```

**Start server:**
```bash
npm run dev
# Server runs at http://localhost:5000
```

### 2. Frontend Setup

```bash
cd frontend
npm install
```

**Start dev server:**
```bash
npm run dev
# Frontend runs at http://localhost:5173
```

### 3. Access Application

- **URL:** http://localhost:5173
- **Admin Login:** use the private `ADMIN_EMAIL` and `ADMIN_PASSWORD` from your local `.env`
- **School Owner:** create a test owner with a private password

---

## Integration Guides

### GupShup WhatsApp Integration

1. **Create GupShup Account:**
   - Go to https://gupshup.io
   - Sign up for Business account
   - Verify WhatsApp number

2. **Get API Credentials:**
   - Dashboard → API Keys → Copy your API Key
   - App Name: Your GupShup app name
   - Webhook URL: `http://your-backend-url/api/webhook/whatsapp`

3. **Configure in App:**
   - Login as school owner
   - Go to Settings → WhatsApp
   - Paste API Key and App Name
   - Save and test connection

4. **Webhook Setup:**
   - Copy webhook URL from app settings
   - Add to GupShup dashboard
   - Test webhook (button in UI)

### Razorpay Integration

1. **Create Razorpay Account:**
   - Go to https://razorpay.com
   - Sign up
   - Complete verification

2. **Get Test Keys:**
   - Dashboard → Settings → API Keys
   - Copy Key ID and Secret
   - Use test keys for development

3. **Update .env:**
   ```
   RAZORPAY_KEY_ID=rzp_test_XXXXX
   RAZORPAY_KEY_SECRET=XXXXX
   ```

4. **Test Payment:**
   - Go to Subscription page
   - Select a plan
   - Use Razorpay test card: 4242 4242 4242 4242
   - Any future date and CVV

### MongoDB Setup

#### Option 1: MongoDB Atlas (Recommended)

1. Go to https://cloud.mongodb.com
2. Create cluster
3. Add IP to whitelist (or allow all)
4. Create database user
5. Get connection string
6. Update `MONGODB_URI` in .env

#### Option 2: Local MongoDB

1. Install MongoDB locally
2. Start MongoDB service
3. Update `MONGODB_URI` in .env:
   ```
   MONGODB_URI=mongodb://localhost:27017/waauto
   ```

---

## Database Seeding

### Seed Default Plans

Run after starting backend:

```bash
curl -X POST http://localhost:5000/api/subscription/seed-plans \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

This creates:
- **Free Plan**: 100 leads, 50 messages/day
- **Basic Plan**: 500 leads, 500 messages/day
- **Pro Plan**: 2000 leads, 2000 messages/day
- **Advanced Plan**: Unlimited leads, 10000 messages/day

---

## Common Tasks

### Create a Test School

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test School",
    "email": "test@school.com",
    "password": "replace-with-a-private-test-password",
    "schoolName": "Test School Name"
  }'
```

### Create a Test Lead

```bash
curl -X POST http://localhost:5000/api/leads \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "John Doe",
    "phone": "+919876543210",
    "email": "john@example.com",
    "status": "new",
    "source": "manual"
  }'
```

### Send a Test Message

```bash
curl -X POST http://localhost:5000/api/whatsapp/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "phone": "+919876543210",
    "message": "Hello from WaAuto!"
  }'
```

### Create Chatbot Rule

```bash
curl -X POST http://localhost:5000/api/chatbot/rules \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "keyword": "hello",
    "response": "Hi! Welcome to our school.",
    "matchType": "contains",
    "priority": 1
  }'
```

---

## Environment Variables Reference

| Variable | Purpose | Example |
|----------|---------|---------|
| PORT | Server port | 5000 |
| NODE_ENV | Environment | development, production |
| MONGODB_URI | Database connection | mongodb+srv://... |
| JWT_SECRET | JWT signing key | any-random-secret |
| JWT_EXPIRE | Token expiration | 7d, 30d |
| RAZORPAY_KEY_ID | Razorpay key | rzp_test_XXXXX |
| RAZORPAY_KEY_SECRET | Razorpay secret | XXXXX |
| GUPSHUP_API_KEY | WhatsApp API key | your_key |
| GUPSHUP_APP_NAME | WhatsApp app name | your_app |
| GUPSHUP_BASE_URL | GupShup API URL | https://api.gupshup.io |
| FRONTEND_URL | Frontend URL | http://localhost:5173 |
| APP_BASE_URL | Backend URL | http://localhost:5000 |

---

## Debugging

### Enable Debug Logs

Add to `.env`:
```
DEBUG=app:*
```

### Check MongoDB Connection

```bash
# From backend directory
node -e "
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI);
mongoose.connection.on('connected', () => console.log('MongoDB connected'));
mongoose.connection.on('error', (err) => console.log('Error:', err));
"
```

### Test API Endpoint

```bash
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Check Server Logs

Look for errors in terminal where you ran `npm run dev`

---

## Performance Tips

1. **Database Indexing:**
   - schoolId is indexed on all collections
   - phone+schoolId indexed on leads
   - Reduces query time significantly

2. **Message Batching:**
   - Broadcast messages are sent in batches of 100
   - 3-second delay between batches
   - Prevents rate limiting

3. **Rate Limiting:**
   - 100 requests per 15 minutes per IP
   - Auth endpoints: 5 requests per 15 minutes
   - Adjustable in `server.js`

4. **Caching:**
   - Plans are cached in memory
   - Update requires server restart

---

## Next Steps

1. ✅ Install dependencies
2. ✅ Configure environment variables
3. ✅ Start backend server
4. ✅ Start frontend server
5. ⬜ Create test school
6. ⬜ Create test leads
7. ⬜ Configure WhatsApp
8. ⬜ Create chatbot rules
9. ⬜ Test broadcast
10. ⬜ Test subscription

---

## Need Help?

- **Check console errors** - Most issues show in terminal
- **Verify environment variables** - Common source of issues
- **Check MongoDB connection** - Database must be accessible
- **Test API endpoints** - Use curl or Postman to test
- **Read logs** - Detailed error messages in server logs

**Happy coding! 🚀**
