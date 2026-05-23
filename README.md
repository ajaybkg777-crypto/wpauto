# WaAuto - WhatsApp Automation SaaS Platform

A comprehensive SaaS platform for WhatsApp automation, lead management, and bulk messaging for schools and coaching centers.

## Features

✅ **Multi-Tenant Architecture** - Complete data isolation per school/client
✅ **Lead Management** - Capture and track leads from multiple sources
✅ **WhatsApp Integration** - Send messages via GupShup or Twilio
✅ **AI Chatbot** - Automated responses based on keyword matching
✅ **Bulk Messaging** - Send campaigns to thousands of leads with rate limiting
✅ **Webhook System** - Real-time message tracking and lead updates
✅ **Subscription Management** - Razorpay integration for payments
✅ **Excel Export** - Download leads data in multiple formats
✅ **Analytics** - Track messages, delivery, and read rates
✅ **Modern Dashboard** - Beautiful React UI with Tailwind CSS

## Tech Stack

### Backend
- **Node.js + Express.js** - REST API server
- **MongoDB** - Multi-tenant database
- **JWT** - Secure authentication
- **Razorpay** - Payment integration
- **ExcelJS** - Excel export functionality

### Frontend
- **React 18** - UI framework
- **Vite** - Fast build tool
- **Tailwind CSS** - Utility-first CSS
- **Framer Motion** - Smooth animations
- **Axios** - HTTP client

## Project Structure

```
Bkg_Wp/
├── backend/
│   ├── config/
│   │   └── db.js                 # MongoDB connection
│   ├── controllers/
│   │   ├── authController.js      # Authentication
│   │   ├── schoolController.js    # School management
│   │   ├── leadController.js      # Lead operations
│   │   ├── whatsappController.js  # WhatsApp API
│   │   ├── webhookController.js   # Incoming webhooks
│   │   ├── chatbotController.js   # Chatbot rules
│   │   ├── broadcastController.js # Bulk messaging
│   │   └── subscriptionController.js # Billing
│   ├── models/
│   │   ├── User.js                # User schema
│   │   ├── School.js              # School/tenant schema
│   │   ├── Lead.js                # Lead schema
│   │   ├── ChatbotRule.js         # Chatbot rules
│   │   ├── Broadcast.js           # Broadcast campaigns
│   │   ├── Subscription.js        # Subscription records
│   │   └── Plan.js                # Subscription plans
│   ├── routes/
│   │   ├── auth.js
│   │   ├── schools.js
│   │   ├── leads.js
│   │   ├── whatsapp.js
│   │   ├── webhook.js
│   │   ├── chatbot.js
│   │   ├── broadcasts.js
│   │   └── subscriptions.js
│   ├── middleware/
│   │   ├── auth.js                # JWT & role-based auth
│   │   └── errorHandler.js        # Global error handling
│   ├── services/
│   │   └── whatsappService.js     # WhatsApp service
│   ├── .env                        # Environment variables
│   ├── server.js                   # Express app
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── common/             # Reusable components
    │   │   └── layout/
    │   │       ├── Sidebar.jsx
    │   │       ├── DashboardLayout.jsx
    │   │       └── PrivateRoute.jsx
    │   ├── pages/
    │   │   ├── auth/
    │   │   │   ├── Login.jsx
    │   │   │   └── Register.jsx
    │   │   ├── dashboard/
    │   │   │   ├── Dashboard.jsx
    │   │   │   └── Settings.jsx
    │   │   ├── leads/
    │   │   │   ├── Leads.jsx
    │   │   │   └── LeadDetail.jsx
    │   │   ├── broadcast/
    │   │   │   ├── Broadcast.jsx
    │   │   │   └── CreateBroadcast.jsx
    │   │   ├── chatbot/
    │   │   │   └── Chatbot.jsx
    │   │   └── subscription/
    │   │       └── Subscription.jsx
    │   ├── services/
    │   │   └── api.js              # Axios API client
    │   ├── context/
    │   │   └── AuthContext.jsx     # Auth state management
    │   ├── hooks/                  # Custom React hooks
    │   ├── App.jsx                 # Main component
    │   ├── main.jsx                # Entry point
    │   ├── index.css               # Global styles
    │   └── tailwind.config.js
    ├── index.html
    ├── vite.config.js
    ├── package.json
    └── tailwind.config.js
```

## Installation & Setup

### Prerequisites
- Node.js 16+ 
- MongoDB Atlas account or local MongoDB
- Razorpay account
- GupShup WhatsApp Business account

### Backend Setup

1. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables (.env):**
   ```
   PORT=5000
   NODE_ENV=development
   MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/dbname
   JWT_SECRET=your-secret-key
   JWT_EXPIRE=7d
   
   # Razorpay
   RAZORPAY_KEY_ID=your_key
   RAZORPAY_KEY_SECRET=your_secret
   
   # GupShup WhatsApp
   GUPSHUP_BASE_URL=https://api.gupshup.io
   GUPSHUP_ONBOARDING_URL=http://localhost:5000/api/webhook/whatsapp
   GUPSHUP_API_KEY=your_api_key
   GUPSHUP_APP_NAME=your_app_name
   
   FRONTEND_URL=http://localhost:5173
   APP_BASE_URL=http://localhost:5000
   ```

4. **Start the backend:**
   ```bash
   npm run dev
   ```
   Server runs on `http://localhost:5000`

### Frontend Setup

1. **Navigate to frontend directory:**
   ```bash
   cd frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```
   App runs on `http://localhost:5173`

## API Endpoints

### Authentication
- `POST /api/auth/register` - School owner registration
- `POST /api/auth/login` - School owner login
- `POST /api/auth/admin-login` - Super admin login
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/profile` - Update profile
- `PUT /api/auth/password` - Change password

### Schools
- `GET /api/schools/profile` - Get school profile
- `PUT /api/schools/profile` - Update school profile
- `GET /api/schools/stats` - Get dashboard stats
- `PUT /api/schools/whatsapp` - Configure WhatsApp
- `GET /api/schools/whatsapp/status` - Check WhatsApp status

### Leads
- `GET /api/leads` - List leads with filters
- `POST /api/leads` - Create lead
- `GET /api/leads/:id` - Get lead details
- `PUT /api/leads/:id` - Update lead
- `DELETE /api/leads/:id` - Delete lead
- `POST /api/leads/import` - Bulk import leads
- `GET /api/leads/export` - Export to Excel
- `POST /api/leads/:id/conversation` - Add message

### WhatsApp
- `POST /api/whatsapp/send` - Send message
- `POST /api/whatsapp/send-template` - Send template
- `GET /api/whatsapp/status/:id` - Check message status

### Webhook
- `POST /api/webhook/whatsapp` - Receive incoming messages
- `GET /api/webhook/whatsapp` - Webhook verification

### Chatbot
- `GET /api/chatbot/rules` - List rules
- `POST /api/chatbot/rules` - Create rule
- `PUT /api/chatbot/rules/:id` - Update rule
- `DELETE /api/chatbot/rules/:id` - Delete rule
- `PATCH /api/chatbot/rules/:id/toggle` - Toggle active
- `POST /api/chatbot/test` - Test chatbot
- `GET /api/chatbot/analytics` - Get stats

### Broadcasts
- `GET /api/broadcasts` - List broadcasts
- `POST /api/broadcasts` - Create broadcast
- `POST /api/broadcasts/:id/start` - Start broadcast
- `DELETE /api/broadcasts/:id` - Delete broadcast

### Subscription
- `GET /api/subscription/plans` - List plans
- `GET /api/subscription/current` - Current subscription
- `POST /api/subscription/create-order` - Create Razorpay order
- `POST /api/subscription/verify` - Verify payment

## Database Schema

### User
- name, email, password (hashed)
- role: super_admin | school_owner | staff
- schoolId (reference to School)
- phone, isActive, lastLogin

### School (Multi-tenant)
- name, slug, logo, address
- owner (reference to User)
- subscription (plan, status, dates)
- whatsapp (provider, apiKey, phoneNumber)
- limits (maxLeads, maxMessagesPerDay, maxBroadcasts)
- analytics (totalLeads, messagesSent, etc.)

### Lead
- schoolId (multi-tenant key)
- name, phone, email
- status: new | interested | pending | not_interested | converted | follow_up
- conversation (array of messages)
- lastMessage, lastMessageAt
- source: website_form | whatsapp_inbound | manual | imported
- tags, notes, assignedTo

### ChatbotRule
- schoolId
- keyword, response
- matchType: exact | contains | starts_with
- isFallback, fallbackMessage
- triggerCount, lastTriggered

### Broadcast
- schoolId
- name, message, recipients (array)
- status: draft | scheduled | processing | completed | failed
- totalRecipients, sentCount, deliveredCount, failedCount
- batchSize, delayBetweenBatches

## Features in Detail

### 1. Multi-Tenant Architecture
- Every request is filtered by `schoolId`
- Middleware `attachSchoolId` adds schoolId to requests
- School owner can only access their own data
- Super admin can access any school

### 2. Lead Management
- Auto-create leads from incoming WhatsApp messages
- Manual lead creation/import
- Track conversation history
- Filter by status, source, date
- Bulk import/export with Excel

### 3. WhatsApp Integration
- Connect via GupShup or Twilio
- Send text, template, and media messages
- Track delivery and read receipts
- Rate limiting (configurable per plan)
- Webhook for incoming messages

### 4. Chatbot System
- Keyword-based routing
- Match types: exact, contains, starts_with
- Priority-based rule matching
- Fallback responses
- Analytics: trigger count, last triggered

### 5. Broadcast System
- Batch processing (100-200 contacts per batch)
- Rate limiting between batches (2-5 seconds)
- Real-time status tracking
- Success/failure reporting
- Scheduled broadcasts

### 6. Subscription System
- 4 Plans: Free, Basic, Pro, Advanced
- Per-plan feature limits
- Razorpay payment integration
- Auto-renewal capability
- Plan downgrade on cancellation

## Deployment Guide

### Backend Deployment (Render)

1. Push code to GitHub
2. Create Render account and connect GitHub
3. Create new Web Service
4. Configure environment variables in Render dashboard
5. Deploy

### Frontend Deployment (Vercel)

1. Push code to GitHub
2. Import project to Vercel
3. Configure build command: `npm run build`
4. Set environment variable: `VITE_API_URL=https://your-backend.render.com`
5. Deploy

## Security Considerations

✅ JWT tokens with expiration
✅ Password hashing with bcrypt
✅ Role-based access control (RBAC)
✅ Rate limiting on all endpoints
✅ Input validation & sanitization
✅ SQL injection prevention (MongoDB)
✅ CORS configuration
✅ Environment variables for secrets

## API Versioning

Current API version: v1 (can be added as `/api/v1/` prefix)

## Rate Limiting

- General endpoints: 100 requests per 15 minutes
- Auth endpoints: 5 requests per 15 minutes (per IP)
- Webhook endpoints: No limit (for GupShup)

## Testing

### Test User Credentials (Development)

```
Admin:
Email: admin@waauto.com
Password: admin123

School Owner:
Email: school@example.com
Password: password123
```

### Test Razorpay Integration
Use Razorpay test credentials:
```
Key: rzp_test_xxxxxxxxxxxx
Secret: xxxxxxxxxxxxxxxxxxxx
```

Test card: 4242 4242 4242 4242

## Troubleshooting

### MongoDB Connection Error
- Check MongoDB URI in .env
- Ensure IP whitelist includes your IP
- Verify network connectivity

### WhatsApp Messages Not Sending
- Check GupShup API key and app name
- Verify webhook URL is accessible
- Check message format compliance

### Build Error (Frontend)
- Clear node_modules and reinstall
- Check Node.js version (16+)
- Run: `npm cache clean --force`

## Future Enhancements

- [ ] Multiple team members per school
- [ ] Advanced analytics & reporting
- [ ] AI-powered lead scoring
- [ ] SMS integration
- [ ] Email integration
- [ ] Mobile app (React Native)
- [ ] Video tutorials & onboarding
- [ ] Custom domain support
- [ ] White-label solution
- [ ] API for third-party integration

## Contributing

1. Create a feature branch
2. Commit changes
3. Push to branch
4. Create Pull Request

## License

MIT License - See LICENSE file for details

## Support

For support, email: support@waauto.com
