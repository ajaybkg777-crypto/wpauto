const mongoose = require('mongoose');
const School = require('./School');

const normalizeLeadPhone = (value = '') => {
  let digits = String(value || '').trim();
  if (!digits) return '';
  digits = digits.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  digits = digits.replace(/\D/g, '');
  if (digits.length === 10) {
    const countryCode = String(process.env.DEFAULT_COUNTRY_CODE || '91').replace(/\D/g, '');
    digits = `${countryCode}${digits}`;
  }
  return digits;
};

const getSchoolContactLimit = (school) => {
  const configured = Number(school?.limits?.maxLeads || 0);
  if (configured > 0) return configured;

  const fallback = {
    free: Number(process.env.LIMIT_CONTACTS_FREE || 500),
    basic: Number(process.env.LIMIT_CONTACTS_BASIC || 2000),
    pro: Number(process.env.LIMIT_CONTACTS_PRO || 10000),
    advanced: Number(process.env.LIMIT_CONTACTS_ADVANCED || 50000)
  };

  return fallback[school?.subscription?.plan || 'free'] || fallback.free;
};

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
leadSchema.index({ schoolId: 1, phone: 1 }, { unique: true });
leadSchema.index({ schoolId: 1, status: 1 });
leadSchema.index({ schoolId: 1, createdAt: -1 });

leadSchema.pre('validate', function normalizePhoneBeforeValidate(next) {
  const normalized = normalizeLeadPhone(this.phone);
  if (normalized) this.phone = normalized;
  next();
});

// Static method to find or create lead
leadSchema.statics.findOrCreate = async function(schoolId, phone, data = {}) {
  const normalizedPhone = normalizeLeadPhone(phone) || phone;
  let lead = await this.findOne({ schoolId, phone: normalizedPhone });
  
  if (!lead) {
    if (process.env.CONTACT_LIMITS_ENABLED === 'true') {
      const [school, leadCount] = await Promise.all([
        School.findById(schoolId).select('limits.maxLeads subscription.plan'),
        this.countDocuments({ schoolId })
      ]);
      const limit = getSchoolContactLimit(school);

      if (!school || limit <= 0 || leadCount >= limit) {
        const plan = school?.subscription?.plan || 'free';
        throw new Error(`Contact limit reached for ${plan} plan (${leadCount}/${limit}). Upgrade or delete old contacts.`);
      }
    }

    lead = await this.create({
      schoolId,
      phone: normalizedPhone,
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
