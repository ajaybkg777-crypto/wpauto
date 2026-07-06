const mongoose = require('mongoose');

const broadcastSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: [true, 'Please provide broadcast name'],
    trim: true
  },
  message: {
    type: String,
    required: [true, 'Please provide message content']
  },
  templateId: {
    type: String
  },
  templateVariables: {
    type: [String],
    default: []
  },
  media: {
    type: {
      type: String,
      enum: ['image'],
      default: undefined
    },
    url: String,
    filename: String
  },
  // Recipients
  recipients: [{
    phone: String,
    name: String,
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead'
    },
    variables: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'sent', 'delivered', 'read', 'failed'],
      default: 'pending'
    },
    messageId: String,
    error: String,
    errorCode: String,
    errorDetails: String,
    retryable: Boolean,
    sendAttempts: {
      type: Number,
      default: 0
    },
    lastAttemptAt: Date,
    sentAt: Date,
    deliveredAt: Date,
    readAt: Date,
    failedAt: Date
  }],
  // Stats
  totalRecipients: {
    type: Number,
    default: 0
  },
  sentCount: {
    type: Number,
    default: 0
  },
  deliveredCount: {
    type: Number,
    default: 0
  },
  readCount: {
    type: Number,
    default: 0
  },
  failedCount: {
    type: Number,
    default: 0
  },
  // Status
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'processing', 'completed', 'cancelled', 'failed'],
    default: 'draft'
  },
  // Scheduling
  scheduledAt: {
    type: Date
  },
  startedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  // Processing
  batchSize: {
    type: Number,
    default: 100
  },
  delayBetweenBatches: {
    type: Number,
    default: 3000 // 3 seconds
  },
  currentBatch: {
    type: Number,
    default: 0
  },
  // Type
  type: {
    type: String,
    enum: ['marketing', 'utility', 'authentication', 'promotional', 'transactional', 'broadcast'],
    default: 'utility'
  },
  // Created by
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index
broadcastSchema.index({ schoolId: 1, status: 1 });
broadcastSchema.index({ schoolId: 1, createdAt: -1 });

module.exports = mongoose.model('Broadcast', broadcastSchema);
