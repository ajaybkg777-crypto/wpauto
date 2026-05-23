const mongoose = require('mongoose');

const schoolSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide school name'],
    trim: true,
    maxlength: [100, 'School name cannot be more than 100 characters']
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  logo: {
    type: String
  },
  branding: {
    includeLogoInMessages: {
      type: Boolean,
      default: true
    }
  },
  address: {
    street: String,
    city: String,
    state: String,
    pincode: String
  },
  phone: {
    type: String
  },
  email: {
    type: String,
    lowercase: true
  },
  website: {
    type: String
  },
  category: {
    type: String,
    default: 'Education'
  },
  // Subscription
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'basic', 'pro', 'advanced'],
      default: 'free'
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'expired', 'cancelled'],
      default: 'active'
    },
    startDate: {
      type: Date
    },
    endDate: {
      type: Date
    },
    razorpaySubscriptionId: {
      type: String
    }
  },
  // WhatsApp Configuration
  whatsapp: {
    provider: {
      type: String,
      enum: ['meta'],
      default: 'meta'
    },
    apiKey: {
      type: String,
      select: false
    },
    appName: String,
    appId: String,
    phoneNumberId: String,
    phoneNumber: String,
    displayName: String,
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
    onboardingStatus: {
      type: String,
      enum: ['not_started', 'pending', 'connected', 'failed'],
      default: 'not_started'
    },
    lastOnboardingEventAt: Date,
    webhookSecret: {
      type: String,
      select: false
    },
    isConnected: {
      type: Boolean,
      default: false
    }
  },
  // Usage Limits
  limits: {
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
    messagesUsedToday: {
      type: Number,
      default: 0
    },
    lastMessageReset: {
      type: Date,
      default: Date.now
    }
  },
  // Analytics
  analytics: {
    totalLeads: {
      type: Number,
      default: 0
    },
    totalMessagesSent: {
      type: Number,
      default: 0
    },
    totalMessagesDelivered: {
      type: Number,
      default: 0
    },
    totalMessagesRead: {
      type: Number,
      default: 0
    }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Create slug before saving
schoolSchema.pre('save', function(next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
  }
  next();
});

// Reset daily message count if new day
schoolSchema.methods.resetDailyLimits = async function() {
  const now = new Date();
  const lastReset = new Date(this.limits.lastMessageReset);
  
  if (now.getDate() !== lastReset.getDate()) {
    this.limits.messagesUsedToday = 0;
    this.limits.lastMessageReset = now;
    await this.save();
  }
};

module.exports = mongoose.model('School', schoolSchema);
