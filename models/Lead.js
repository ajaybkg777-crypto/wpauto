const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: [true, 'Please provide lead name'],
    trim: true,
    maxlength: [100, 'Name cannot be more than 100 characters']
  },
  phone: {
    type: String,
    required: [true, 'Please provide phone number'],
    trim: true
  },
  email: {
    type: String,
    lowercase: true,
    trim: true
  },
  source: {
    type: String,
    enum: ['website_form', 'whatsapp_inbound', 'manual', 'imported'],
    default: 'manual'
  },
  status: {
    type: String,
    enum: ['new', 'interested', 'not_interested', 'pending', 'converted', 'follow_up'],
    default: 'new'
  },
  // WhatsApp conversation
  conversation: [{
    from: {
      type: String,
      enum: ['user', 'school']
    },
    message: {
      type: String
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    messageId: String,
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read', 'failed'],
      default: 'sent'
    }
  }],
  lastMessage: {
    type: String
  },
  lastMessageAt: {
    type: Date
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  tags: [{
    type: String
  }],
  chatbotSession: {
    ruleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatbotRule'
    },
    currentStepId: String,
    isActive: {
      type: Boolean,
      default: false
    },
    updatedAt: Date
  },
  // Follow-up
  nextFollowUp: {
    type: Date
  },
  notes: {
    type: String
  },
  // Source tracking
  utmSource: String,
  utmMedium: String,
  utmCampaign: String
}, {
  timestamps: true
});

// Index for efficient queries
leadSchema.index({ schoolId: 1, phone: 1 });
leadSchema.index({ schoolId: 1, status: 1 });
leadSchema.index({ schoolId: 1, createdAt: -1 });

// Static method to find or create lead
leadSchema.statics.findOrCreate = async function(schoolId, phone, data = {}) {
  let lead = await this.findOne({ schoolId, phone });
  
  if (!lead) {
    lead = await this.create({
      schoolId,
      phone,
      ...data
    });
  } else {
    // Update existing lead
    if (data.name) lead.name = data.name;
    if (data.lastMessage) {
      lead.lastMessage = data.lastMessage;
      lead.lastMessageAt = new Date();
    }
    await lead.save();
  }
  
  return lead;
};

module.exports = mongoose.model('Lead', leadSchema);
