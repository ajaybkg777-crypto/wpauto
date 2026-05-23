const mongoose = require('mongoose');

const chatbotRuleSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  keyword: {
    type: String,
    required: [true, 'Please provide a keyword'],
    trim: true,
    lowercase: true
  },
  ruleType: {
    type: String,
    enum: ['keyword', 'flow'],
    default: 'keyword'
  },
  title: {
    type: String,
    trim: true
  },
  response: {
    type: String,
    required: [true, 'Please provide a response message'],
    trim: true
  },
  responseType: {
    type: String,
    enum: ['text', 'image', 'video', 'document'],
    default: 'text'
  },
  mediaUrl: {
    type: String
  },
  quickReplies: [{
    label: String,
    value: String
  }],
  actions: {
    addTags: [String],
    setStatus: {
      type: String,
      enum: ['new', 'interested', 'not_interested', 'pending', 'converted', 'follow_up']
    }
  },
  flow: {
    startStepId: String,
    steps: [{
      id: String,
      question: String,
      options: [{
        label: String,
        value: String,
        response: String,
        nextStepId: String,
        addTags: [String],
        setStatus: {
          type: String,
          enum: ['new', 'interested', 'not_interested', 'pending', 'converted', 'follow_up']
        },
        endFlow: {
          type: Boolean,
          default: false
        }
      }],
      fallbackResponse: String
    }]
  },
  isActive: {
    type: Boolean,
    default: true
  },
  priority: {
    type: Number,
    default: 0
  },
  // Fallback response
  isFallback: {
    type: Boolean,
    default: false
  },
  fallbackMessage: {
    type: String
  },
  // Match type
  matchType: {
    type: String,
    enum: ['exact', 'contains', 'starts_with'],
    default: 'contains'
  },
  // Analytics
  triggerCount: {
    type: Number,
    default: 0
  },
  lastTriggered: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for efficient keyword matching
chatbotRuleSchema.index({ schoolId: 1, keyword: 1 });
chatbotRuleSchema.index({ schoolId: 1, isActive: 1 });

module.exports = mongoose.model('ChatbotRule', chatbotRuleSchema);
