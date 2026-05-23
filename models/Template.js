const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: [true, 'Please provide template name'],
    trim: true,
    lowercase: true
  },
  category: {
    type: String,
    enum: ['marketing', 'utility', 'authentication'],
    required: true
  },
  language: {
    type: String,
    default: 'en_US'
  },
  body: {
    type: String,
    required: [true, 'Please provide template body']
  },
  header: {
    type: {
      type: String,
      enum: ['none', 'text', 'image', 'video', 'document', 'location'],
      default: 'none'
    },
    text: String,
    location: {
      latitude: String,
      longitude: String,
      name: String,
      address: String
    }
  },
  footer: String,
  buttons: [{
    type: {
      type: String,
      enum: ['custom', 'quick_reply', 'url', 'call_whatsapp', 'phone_number', 'copy_offer_code'],
      required: true
    },
    text: {
      type: String,
      required: true
    },
    url: String,
    phoneNumber: String,
    offerCode: String
  }],
  media: {
    type: {
      type: String,
      enum: ['image', 'video', 'document'],
      default: undefined
    },
    url: String,
    filename: String,
    mimetype: String
  },
  sampleText: String,
  metaTemplateId: String,
  status: {
    type: String,
    enum: ['draft', 'pending', 'approved', 'rejected'],
    default: 'draft'
  },
  rejectionReason: String,
  submittedAt: Date,
  approvedAt: Date,
  rejectedAt: Date,
  syncedAt: Date,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

templateSchema.index({ schoolId: 1, name: 1 }, { unique: true });
templateSchema.index({ schoolId: 1, status: 1 });

module.exports = mongoose.model('Template', templateSchema);
