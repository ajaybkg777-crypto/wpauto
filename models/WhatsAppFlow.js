const mongoose = require('mongoose');

const flowFieldSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['text', 'textarea', 'email', 'phone', 'number', 'date', 'single_select', 'multi_select', 'rating'],
    required: true
  },
  label: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  required: {
    type: Boolean,
    default: false
  },
  options: [String]
}, { _id: false });

const whatsAppFlowSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    enum: ['SIGN_UP', 'SIGN_IN', 'APPOINTMENT_BOOKING', 'LEAD_GENERATION', 'CONTACT_US', 'CUSTOMER_SUPPORT', 'SURVEY', 'OTHER'],
    default: 'LEAD_GENERATION'
  },
  mode: {
    type: String,
    enum: ['without_endpoint', 'with_endpoint'],
    default: 'without_endpoint'
  },
  title: {
    type: String,
    default: 'Lead Form'
  },
  description: String,
  submitLabel: {
    type: String,
    default: 'Submit'
  },
  endpointUri: String,
  fields: [flowFieldSchema],
  flowJson: String,
  metaFlowId: String,
  status: {
    type: String,
    enum: ['draft', 'submitted', 'published', 'rejected'],
    default: 'draft'
  },
  validationErrors: [{
    message: String,
    errorType: String,
    lineStart: Number,
    lineEnd: Number
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  submittedAt: Date,
  publishedAt: Date
}, {
  timestamps: true
});

whatsAppFlowSchema.index({ schoolId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('WhatsAppFlow', whatsAppFlowSchema);
