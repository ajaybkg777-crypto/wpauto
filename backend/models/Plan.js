const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    enum: ['free', 'basic', 'pro', 'advanced']
  },
  displayName: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  // Pricing
  monthlyPrice: {
    type: Number,
    default: 0
  },
  yearlyPrice: {
    type: Number,
    default: 0
  },
  // Features
  features: {
    maxLeads: {
      type: Number,
      default: 100
    },
    maxMessagesPerDay: {
      type: Number,
      default: 50
    },
    maxBroadcasts: {
      type: Number,
      default: 5
    },
    chatbotEnabled: {
      type: Boolean,
      default: false
    },
    analyticsEnabled: {
      type: Boolean,
      default: false
    },
    automationEnabled: {
      type: Boolean,
      default: false
    },
    prioritySupport: {
      type: Boolean,
      default: false
    },
    customBranding: {
      type: Boolean,
      default: false
    },
    apiAccess: {
      type: Boolean,
      default: false
    }
  },
  // Limits
  limits: {
    maxUsers: {
      type: Number,
      default: 1
    },
    maxContacts: {
      type: Number,
      default: 100
    },
    maxTemplates: {
      type: Number,
      default: 5
    }
  },
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  // Order
  sortOrder: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Plan', planSchema);