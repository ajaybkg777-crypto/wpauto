const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  plan: {
    type: String,
    enum: ['free', 'basic', 'pro', 'advanced'],
    required: true
  },
  // Razorpay details
  razorpaySubscriptionId: {
    type: String
  },
  razorpayCustomerId: {
    type: String
  },
  razorpayInvoiceId: {
    type: String
  },
  // Subscription details
  status: {
    type: String,
    enum: ['active', 'inactive', 'expired', 'cancelled', 'pending'],
    default: 'pending'
  },
  startDate: {
    type: Date
  },
  endDate: {
    type: Date
  },
  // Billing
  amount: {
    type: Number,
    default: 0
  },
  currency: {
    type: String,
    default: 'INR'
  },
  billingCycle: {
    type: String,
    enum: ['monthly', 'yearly'],
    default: 'monthly'
  },
  // Features included
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
    }
  },
  // Payment info
  paymentMethod: {
    type: String
  },
  lastPaymentDate: {
    type: Date
  },
  nextPaymentDate: {
    type: Date
  },
  // Notes
  notes: {
    type: String
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Subscription', subscriptionSchema);