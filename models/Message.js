const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  leadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lead',
    index: true
  },
  phoneNumberId: {
    type: String,
    index: true
  },
  wabaId: {
    type: String,
    index: true
  },
  userNumber: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  direction: {
    type: String,
    enum: ['inbound', 'outbound'],
    required: true
  },
  message: {
    type: String,
    default: ''
  },
  messageType: {
    type: String,
    default: 'text'
  },
  metaMessageId: {
    type: String,
    index: true
  },
  status: {
    type: String,
    enum: ['received', 'sent', 'delivered', 'read', 'failed'],
    default: 'received',
    index: true
  },
  error: String,
  errorCode: {
    type: String,
    index: true
  },
  errorDetails: String,
  retryable: Boolean,
  sentAt: Date,
  deliveredAt: Date,
  readAt: Date,
  failedAt: Date,
  rawPayload: {
    type: mongoose.Schema.Types.Mixed,
    select: false
  }
}, {
  timestamps: true
});

messageSchema.index({ schoolId: 1, createdAt: -1 });
messageSchema.index({ schoolId: 1, status: 1 });

module.exports = mongoose.model('Message', messageSchema);
