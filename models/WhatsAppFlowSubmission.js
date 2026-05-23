const mongoose = require('mongoose');

const whatsAppFlowSubmissionSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  flowId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WhatsAppFlow',
    index: true
  },
  metaFlowId: {
    type: String,
    index: true
  },
  leadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lead',
    index: true
  },
  phone: {
    type: String,
    required: true,
    index: true
  },
  name: String,
  answers: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  rawPayload: {
    type: mongoose.Schema.Types.Mixed,
    select: false
  },
  submittedAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

whatsAppFlowSubmissionSchema.index({ schoolId: 1, submittedAt: -1 });

module.exports = mongoose.model('WhatsAppFlowSubmission', whatsAppFlowSubmissionSchema);
