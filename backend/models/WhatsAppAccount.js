const mongoose = require('mongoose');

const whatsappAccountSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true,
    unique: true
  },
  connectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  provider: {
    type: String,
    enum: ['meta'],
    default: 'meta'
  },
  appName: {
    type: String,
    trim: true
  },
  appId: String,
  phoneNumber: {
    type: String,
    trim: true
  },
  displayName: String,
  phoneNumberId: String,
  wabaId: String,
  businessId: String,
  businessVerificationStatus: {
    type: String,
    enum: ['unknown', 'pending', 'verified', 'rejected'],
    default: 'unknown'
  },
  accountReviewStatus: {
    type: String,
    enum: ['UNKNOWN', 'PENDING', 'APPROVED', 'REJECTED'],
    default: 'UNKNOWN'
  },
  namespace: String,
  qualityRating: String,
  codeVerificationStatus: String,
  lastSyncedAt: Date,
  syncError: String,
  accessToken: {
    type: String,
    select: false
  },
  apiKey: {
    type: String,
    select: false
  },
  tokenExpiresAt: Date,
  webhookSecret: {
    type: String,
    select: false
  },
  status: {
    type: String,
    enum: ['not_started', 'pending', 'connected', 'failed', 'disconnected'],
    default: 'not_started',
    index: true
  },
  lastOnboardingEventAt: Date,
  connectedAt: Date,
  disconnectedAt: Date,
  rawMetadata: {
    type: mongoose.Schema.Types.Mixed,
    select: false
  }
}, {
  timestamps: true
});

whatsappAccountSchema.index({ provider: 1, appName: 1 });
whatsappAccountSchema.index({ provider: 1, phoneNumber: 1 });
whatsappAccountSchema.index({ provider: 1, wabaId: 1 });

module.exports = mongoose.model('WhatsAppAccount', whatsappAccountSchema);
