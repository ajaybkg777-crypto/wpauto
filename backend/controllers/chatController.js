const Lead = require('../models/Lead');
const Message = require('../models/Message');
const School = require('../models/School');
const { createWhatsAppService } = require('../services/whatsappService');
const { leadConversationUpdate } = require('../utils/storagePolicy');

const buildLastMessage = (lead) => {
  return {
    text: lead.lastMessage || '',
    from: 'user',
    at: lead.lastMessageAt || lead.updatedAt
  };
};

// @desc    Get inbox list for live chat
// @route   GET /api/chats/inbox
// @access  Private
exports.getInbox = async (req, res) => {
  try {
    const { search = '', status = '', tag = '', page = 1, limit = 25 } = req.query;

    const query = { schoolId: req.schoolId };
    if (status) query.status = status;
    if (tag) query.tags = tag;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const pageNumber = Number(page) || 1;
    const pageSize = Number(limit) || 25;
    const skip = (pageNumber - 1) * pageSize;

    const [leads, total] = await Promise.all([
      Lead.find(query)
        .sort({ lastMessageAt: -1, updatedAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .select('name phone email status tags lastMessage lastMessageAt updatedAt'),
      Lead.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      total,
      page: pageNumber,
      pages: Math.ceil(total / pageSize),
      data: leads.map((lead) => ({
        _id: lead._id,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        status: lead.status,
        tags: lead.tags || [],
        lastMessage: buildLastMessage(lead)
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get one chat conversation with timeline
// @route   GET /api/chats/:leadId
// @access  Private
exports.getConversation = async (req, res) => {
  try {
    const lead = await Lead.findOne({ _id: req.params.leadId, schoolId: req.schoolId })
      .select('name phone email status tags lastMessage lastMessageAt conversation');

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    const messageLedger = await Message.find({
      schoolId: req.schoolId,
      leadId: lead._id
    })
      .sort({ createdAt: 1 })
      .select('direction message messageType status metaMessageId createdAt sentAt deliveredAt readAt failedAt');

    const ledgerTimeline = messageLedger.map((item) => ({
      from: item.direction === 'outbound' ? 'school' : 'user',
      message: item.message,
      timestamp: item.createdAt,
      messageId: item.metaMessageId,
      status: item.status
    }));
    const legacyTimeline = (lead.conversation || []).map((item) => ({
      from: item.from,
      message: item.message,
      timestamp: item.timestamp,
      messageId: item.messageId,
      status: item.status
    }));
    const timeline = ledgerTimeline.length ? ledgerTimeline : legacyTimeline;

    res.status(200).json({
      success: true,
      data: {
        lead,
        timeline,
        ledger: messageLedger
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Send message from live chat
// @route   POST /api/chats/:leadId/send
// @access  Private
exports.sendChatMessage = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !String(message).trim()) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    const lead = await Lead.findOne({ _id: req.params.leadId, schoolId: req.schoolId });
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    const school = await School.findById(req.schoolId);
    await school.resetDailyLimits();

    if (school.limits.messagesUsedToday >= school.limits.maxMessagesPerDay) {
      return res.status(403).json({ success: false, message: 'Daily message limit reached' });
    }

    const lastInbound = await Message.findOne({
      schoolId: req.schoolId,
      leadId: lead._id,
      direction: 'inbound'
    }).sort({ createdAt: -1 }).select('createdAt');
    const legacyInbound = (lead.conversation || [])
      .filter((item) => item.from === 'user' && item.timestamp)
      .sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp))[0];
    const lastInboundAt = lastInbound?.createdAt || legacyInbound?.timestamp;
    const customerWindowMs = Number(process.env.WHATSAPP_CUSTOMER_WINDOW_HOURS || 24) * 60 * 60 * 1000;

    if (!lastInboundAt || Date.now() - new Date(lastInboundAt).getTime() > customerWindowMs) {
      return res.status(400).json({
        success: false,
        message: 'WhatsApp free-text chat is available only within 24 hours of the customer reply. Send an approved template/broadcast first, then continue live chat after they reply.'
      });
    }

    const whatsappService = createWhatsAppService(req.schoolId);
    const result = await whatsappService.sendMessage(lead.phone, String(message).trim());

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.error || 'Failed to send message' });
    }

    await Lead.findByIdAndUpdate(lead._id, leadConversationUpdate({
      from: 'school',
      message: String(message).trim(),
      timestamp: new Date(),
      messageId: result.messageId,
      status: 'sent'
    }));

    await Message.create({
      schoolId: req.schoolId,
      leadId: lead._id,
      phoneNumberId: school?.whatsapp?.phoneNumberId,
      wabaId: school?.whatsapp?.wabaId,
      userNumber: lead.phone,
      direction: 'outbound',
      message: String(message).trim(),
      messageType: 'text',
      metaMessageId: result.messageId,
      status: 'sent',
      sentAt: new Date()
    });

    await School.findByIdAndUpdate(req.schoolId, {
      $inc: {
        'analytics.totalMessagesSent': 1,
        'limits.messagesUsedToday': 1
      }
    });

    res.status(200).json({
      success: true,
      messageId: result.messageId
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
