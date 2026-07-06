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

const getChatWindowStart = (days = 7) => {
  const safeDays = Math.max(1, Math.min(Number(days) || 7, 90));
  return new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
};

const normalizeChatPhone = (value = '') => {
  let digits = String(value || '').trim();
  if (!digits) return '';
  digits = digits.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  digits = digits.replace(/\D/g, '');
  if (digits.length === 10) digits = `${process.env.DEFAULT_COUNTRY_CODE || '91'}${digits}`;
  return digits;
};

const getPhoneAliases = (phone = '') => {
  const normalized = normalizeChatPhone(phone);
  const aliases = new Set([phone, normalized].filter(Boolean));
  if (normalized.startsWith('91') && normalized.length === 12) aliases.add(normalized.slice(2));
  return [...aliases];
};

const toPhoneChatId = (phone = '') => `phone_${normalizeChatPhone(phone) || String(phone).replace(/\W/g, '')}`;

const isPhoneChatId = (value = '') => /^phone_\d{8,15}$/.test(String(value));

const matchesSearch = (lead, phone, search = '') => {
  const query = String(search || '').trim().toLowerCase();
  if (!query) return true;
  return [
    lead?.name,
    lead?.phone,
    lead?.email,
    phone
  ].some((value) => String(value || '').toLowerCase().includes(query));
};

// @desc    Get inbox list for live chat
// @route   GET /api/chats/inbox
// @access  Private
exports.getInbox = async (req, res) => {
  try {
    const { search = '', status = '', tag = '', page = 1, limit = 25, days = 7 } = req.query;
    const windowStart = getChatWindowStart(days);

    const pageNumber = Number(page) || 1;
    const pageSize = Number(limit) || 25;
    const skip = (pageNumber - 1) * pageSize;

    const leadQuery = {
      schoolId: req.schoolId,
      lastMessageAt: { $gte: windowStart }
    };
    if (status) leadQuery.status = status;
    if (tag) leadQuery.tags = tag;
    if (search) {
      leadQuery.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const [messageGroups, legacyLeads] = await Promise.all([
      Message.aggregate([
        {
          $match: {
            schoolId: req.schoolId,
            createdAt: { $gte: windowStart }
          }
        },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: '$userNumber',
            lastMessage: { $first: '$message' },
            lastDirection: { $first: '$direction' },
            lastStatus: { $first: '$status' },
            lastAt: { $first: '$createdAt' },
            leadId: { $first: '$leadId' },
            messageCount: { $sum: 1 }
          }
        },
        { $sort: { lastAt: -1 } }
      ]),
      Lead.find(leadQuery)
        .sort({ lastMessageAt: -1, updatedAt: -1 })
        .select('name phone email status tags lastMessage lastMessageAt updatedAt')
    ]);

    const leadIds = messageGroups.map((group) => group.leadId).filter(Boolean);
    const phones = messageGroups.flatMap((group) => getPhoneAliases(group._id));
    const leadMatchOr = [
      ...(leadIds.length ? [{ _id: { $in: leadIds } }] : []),
      ...(phones.length ? [{ phone: { $in: phones } }] : [])
    ];
    const matchedLeads = leadMatchOr.length
      ? await Lead.find({
        schoolId: req.schoolId,
        $or: leadMatchOr
      }).select('name phone email status tags lastMessage lastMessageAt updatedAt')
      : [];

    const leadsById = new Map(matchedLeads.map((lead) => [String(lead._id), lead]));
    const leadsByPhone = new Map();
    matchedLeads.forEach((lead) => {
      getPhoneAliases(lead.phone).forEach((phone) => leadsByPhone.set(phone, lead));
    });

    const itemsById = new Map();
    const normalizedStatus = String(status || '').trim();

    messageGroups.forEach((group) => {
      const phone = normalizeChatPhone(group._id) || group._id;
      const lead = (group.leadId && leadsById.get(String(group.leadId))) || leadsByPhone.get(phone);
      const itemStatus = lead?.status || 'broadcast';
      if (normalizedStatus && itemStatus !== normalizedStatus) return;
      if (tag && !lead?.tags?.includes(tag)) return;
      if (!matchesSearch(lead, phone, search)) return;

      const id = lead?._id ? String(lead._id) : toPhoneChatId(phone);
      itemsById.set(id, {
        _id: id,
        name: lead?.name || phone,
        phone: lead?.phone || phone,
        email: lead?.email || '',
        status: itemStatus,
        tags: lead?.tags || [],
        messageCount: group.messageCount,
        lastMessage: {
          text: group.lastMessage || '',
          from: group.lastDirection === 'outbound' ? 'school' : 'user',
          at: group.lastAt,
          status: group.lastStatus
        }
      });
    });

    legacyLeads.forEach((lead) => {
      const id = String(lead._id);
      if (itemsById.has(id)) return;
      itemsById.set(id, {
        _id: id,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        status: lead.status,
        tags: lead.tags || [],
        lastMessage: buildLastMessage(lead)
      });
    });

    const inboxItems = [...itemsById.values()]
      .sort((left, right) => new Date(right.lastMessage?.at || 0) - new Date(left.lastMessage?.at || 0));
    const pagedItems = inboxItems.slice(skip, skip + pageSize);

    res.status(200).json({
      success: true,
      total: inboxItems.length,
      page: pageNumber,
      pages: Math.ceil(inboxItems.length / pageSize),
      windowDays: Number(days) || 7,
      windowStart,
      data: pagedItems
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
    const windowStart = getChatWindowStart(req.query.days || 7);
    const phoneChat = isPhoneChatId(req.params.leadId);
    const phone = phoneChat ? req.params.leadId.replace(/^phone_/, '') : '';
    const lead = phoneChat
      ? await Lead.findOne({ schoolId: req.schoolId, phone: { $in: getPhoneAliases(phone) } })
        .select('name phone email status tags lastMessage lastMessageAt conversation')
      : await Lead.findOne({ _id: req.params.leadId, schoolId: req.schoolId })
        .select('name phone email status tags lastMessage lastMessageAt conversation');

    if (!lead && !phoneChat) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    const phoneAliases = getPhoneAliases(lead?.phone || phone);
    const messageOr = [
      ...(lead?._id ? [{ leadId: lead._id }] : []),
      ...(phoneAliases.length ? [{ userNumber: { $in: phoneAliases } }] : [])
    ];

    const messageLedger = await Message.find({
      schoolId: req.schoolId,
      ...(messageOr.length ? { $or: messageOr } : { leadId: lead?._id }),
      createdAt: { $gte: windowStart }
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
    const legacyTimeline = (lead?.conversation || [])
      .filter((item) => !item.timestamp || new Date(item.timestamp) >= windowStart)
      .map((item) => ({
        from: item.from,
        message: item.message,
        timestamp: item.timestamp,
        messageId: item.messageId,
        status: item.status
      }));
    const seen = new Set();
    const timeline = [...ledgerTimeline, ...legacyTimeline]
      .filter((item) => {
        const key = item.messageId || `${item.from}:${item.timestamp}:${item.message}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((left, right) => new Date(left.timestamp || 0) - new Date(right.timestamp || 0));

    const publicLead = lead || {
      _id: toPhoneChatId(phone),
      name: phone,
      phone,
      email: '',
      status: 'broadcast',
      tags: []
    };

    res.status(200).json({
      success: true,
      data: {
        lead: publicLead,
        timeline,
        ledger: messageLedger,
        windowStart
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

    const phoneChat = isPhoneChatId(req.params.leadId);
    const phone = phoneChat ? req.params.leadId.replace(/^phone_/, '') : '';
    const lead = phoneChat
      ? await Lead.findOne({ schoolId: req.schoolId, phone: { $in: getPhoneAliases(phone) } })
      : await Lead.findOne({ _id: req.params.leadId, schoolId: req.schoolId });
    if (!lead) {
      return res.status(404).json({
        success: false,
        message: phoneChat
          ? 'This broadcast recipient has no saved contact reply yet. Live chat starts after the customer replies.'
          : 'Lead not found'
      });
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
    const normalizedPhone = normalizeChatPhone(lead.phone);
    const result = await whatsappService.sendMessage(normalizedPhone, String(message).trim());

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || 'Failed to send message',
        errorCode: result.errorCode,
        errorDetails: result.errorDetails,
        retryable: result.retryable
      });
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
      userNumber: normalizedPhone,
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
