const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const path = require('path');
const connectDB = require('./config/db');
const { validateEnv } = require('./config/env');
const { asyncHandler, errorHandler, notFound } = require('./middleware/errorHandler');
const { processDueScheduledBroadcasts } = require('./controllers/broadcastController');
const { handleOnboardingCallback } = require('./controllers/whatsappController');
const { runDataRetentionCleanup } = require('./services/dataRetentionService');
const { runBootstrap } = require('./services/bootstrapService');

// Load env vars
dotenv.config();
validateEnv();

// Connect to database and seed required runtime records
connectDB().then(() => runBootstrap()).catch((error) => {
  console.error(`Bootstrap error: ${error.message}`);
  process.exit(1);
});

// Route files
const authRoutes = require('./routes/auth');
const schoolRoutes = require('./routes/schools');
const leadRoutes = require('./routes/leads');
const chatRoutes = require('./routes/chats');
const whatsappRoutes = require('./routes/whatsapp');
const webhookRoutes = require('./routes/webhook');
const chatbotRoutes = require('./routes/chatbot');
const broadcastRoutes = require('./routes/broadcasts');
const templateRoutes = require('./routes/templates');
const flowRoutes = require('./routes/flows');
const subscriptionRoutes = require('./routes/subscriptions');

const app = express();
app.set('trust proxy', 1);

// Body parser. Keep the raw JSON bytes for Meta's X-Hub-Signature-256 check.
app.use(express.json({
  limit: process.env.JSON_BODY_LIMIT || '25mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: process.env.JSON_BODY_LIMIT || '25mb' }));

// Enable CORS
const allowedOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  const normalizedOrigin = String(origin).trim().replace(/\/+$/, '');
  if (!allowedOrigins.length || allowedOrigins.includes(normalizedOrigin)) return true;

  try {
    const { hostname, protocol } = new URL(normalizedOrigin);
    const isLocalhost = ['localhost', '127.0.0.1'].includes(hostname);
    const isCloudflareTunnel = protocol === 'https:' && hostname.endsWith('.trycloudflare.com');
    const allowVercel = process.env.CORS_ALLOW_VERCEL !== 'false';
    const isVercelApp = protocol === 'https:' && hostname.endsWith('.vercel.app');
    return isLocalhost || isCloudflareTunnel || (allowVercel && isVercelApp);
  } catch (error) {
    return false;
  }
};

app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Public uploaded assets
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rate limiting
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX || (process.env.NODE_ENV === 'development' ? 1000 : 100));
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: rateLimitMax,
  message: 'Too many requests from this IP, please try again later'
});

app.use('/api/', limiter);

// Mount routers
app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes);
app.use('/api/schools', schoolRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/webhook', webhookRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/broadcasts', broadcastRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/flows', flowRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.get('/auth/meta/callback', asyncHandler(handleOnboardingCallback));
app.post('/auth/meta/callback', asyncHandler(handleOnboardingCallback));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'API is running' });
});

app.get('/', (req, res) => {
  res.json({ success: true, message: 'WaAuto backend is running' });
});

app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// Error handling
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

if (process.env.ENABLE_SCHEDULER !== 'false') {
  setTimeout(() => {
    processDueScheduledBroadcasts().catch((error) => {
      console.error('Initial broadcast worker error:', error);
    });
  }, 5 * 1000);

  setInterval(() => {
    processDueScheduledBroadcasts().catch((error) => {
      console.error('Scheduled broadcast worker error:', error);
    });
  }, 60 * 1000);

  setTimeout(() => {
    runDataRetentionCleanup()
      .then((summary) => console.log('Data retention cleanup:', summary))
      .catch((error) => console.error('Data retention cleanup error:', error));
  }, 30 * 1000);

  setInterval(() => {
    runDataRetentionCleanup()
      .then((summary) => console.log('Data retention cleanup:', summary))
      .catch((error) => console.error('Data retention cleanup error:', error));
  }, 24 * 60 * 60 * 1000);
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.error(`Error: ${err.message}`);
  // Close server & exit process
  server.close(() => process.exit(1));
});

module.exports = app;
