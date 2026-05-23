const Broadcast = require('../models/Broadcast');
const Lead = require('../models/Lead');
const School = require('../models/School');
const Template = require('../models/Template');
const WhatsAppAccount = require('../models/WhatsAppAccount');
const { createWhatsAppService } = require('../services/whatsappService');
const { decryptSecret } = require('../utils/tokenVault');

const getPublicAssetUrl = (assetPath) => {
  if (!assetPath) return '';
  if (/^https?:\/\//i.test(assetPath)) return assetPath;
  if (!process.env.APP_BASE_URL) return '';

  return `${process.env.APP_BASE_URL.replace(/\/$/, '')}${assetPath}`;
};

const isTemplateBroadcastRequired = () => process.env.BROADCAST_ALLOW_FREEFORM !== 'true';

const getMetaGraphBaseUrl = () => {
  const version = process.env.META_GRAPH_API_VERSION || 'v25.0';
  return `https://graph.facebook.com/${version}`;
};

const extractBodyVariables = (body = '') => {
  const matches = String(body).match(/{{\s*\d+\s*}}/g) || [];
  return [...new Set(matches.map((match) => match.replace(/[{}\s]/g, '')))]
    .sort((left, right) => Number(left) - Number(right));
};

const normalizeWhatsAppPhone = (phone) => {
  const raw = String(phone || '').trim();
  if (!raw) return null;

  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  digits = digits.replace(/\D/g, '');

  if (digits.length === 10) {
    const defaultCountryCode = String(process.env.DEFAULT_COUNTRY_CODE || '91').replace(/\D/g, '');
    digits = `${defaultCountryCode}${digits}`;
  }

  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
};

const buildRecipients = (leads) => {
  const seen = new Set();
  return leads.reduce((items, lead) => {
    const phone = normalizeWhatsAppPhone(lead.phone);
    if (!phone || seen.has(phone)) return items;
    seen.add(phone);
    items.push({
      phone,
      name: lead.name,
      leadId: lead._id
    });
    return items;
  }, []);
};

const validateTemplateBroadcastPayload = (template, templateVariables = [], media) => {
  const variableKeys = extractBodyVariables(template.body);
  const values = Array.isArray(templateVariables) ? templateVariables : [];

  if (values.length < variableKeys.length || values.slice(0, variableKeys.length).some((value) => !String(value || '').trim())) {
    throw new Error(`Please provide all ${variableKeys.length} template variable value(s) before creating the broadcast`);
  }

  if (template.header?.type === 'image') {
    const mediaUrl = getPublicAssetUrl(media?.url);
    if (!mediaUrl) {
      throw new Error('Image header templates need a public HTTPS image URL. Set APP_BASE_URL and upload the header image again.');
    }
    if (!/^https:\/\//i.test(mediaUrl) && process.env.NODE_ENV === 'production') {
      throw new Error('Meta requires an HTTPS image URL for image header templates');
    }
  }
};

const normalizeMetaTemplateStatus = (status) => {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'APPROVED') return 'approved';
  if (normalized === 'REJECTED' || normalized === 'PAUSED' || normalized === 'DISABLED') return 'rejected';
  return 'pending';
};

const getTemplateMetaConfig = async (schoolId) => {
  const [school, account] = await Promise.all([
    School.findById(schoolId),
    WhatsAppAccount.findOne({ schoolId }).select('+accessToken')
  ]);

  const wabaId = account?.wabaId || school?.whatsapp?.wabaId || process.env.META_WABA_ID;
  const accessToken = decryptSecret(account?.accessToken || process.env.META_SYSTEM_USER_ACCESS_TOKEN);

  if (!wabaId || !accessToken) {
    throw new Error('Meta WhatsApp account is not fully configured');
  }

  return { wabaId, accessToken };
};

const refreshTemplateApproval = async (template) => {
  const { wabaId, accessToken } = await getTemplateMetaConfig(template.schoolId);
  const url = new URL(`${getMetaGraphBaseUrl()}/${wabaId}/message_templates`);
  url.searchParams.set('fields', 'id,name,status,category,language,rejected_reason');
  url.searchParams.set('limit', '250');

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error?.message || 'Could not verify template approval with Meta');
  }

  const metaTemplate = (data.data || []).find((item) => item.id === template.metaTemplateId)
    || (data.data || []).find((item) => item.name === template.name && item.language === template.language)
    || (data.data || []).find((item) => item.name === template.name);

  if (!metaTemplate) {
    template.status = 'rejected';
    template.rejectionReason = 'Template was not found in Meta WhatsApp Manager';
    template.syncedAt = new Date();
    await template.save();
    return template;
  }

  const nextStatus = normalizeMetaTemplateStatus(metaTemplate.status);
  template.status = nextStatus;
  template.metaTemplateId = metaTemplate.id || template.metaTemplateId;
  template.rejectionReason = metaTemplate.rejected_reason || undefined;
  template.syncedAt = new Date();
  if (nextStatus === 'approved') {
    template.approvedAt = template.approvedAt || new Date();
    template.rejectedAt = undefined;
  }
  if (nextStatus === 'rejected') {
    template.rejectedAt = template.rejectedAt || new Date();
    template.approvedAt = undefined;
  }
  await template.save();
  return template;
};

const getApprovedTemplate = async (schoolId, templateId) => {
  if (!templateId) return null;

  const query = {
    schoolId,
    $or: [
      { name: templateId },
      { metaTemplateId: templateId }
    ]
  };

  if (/^[a-f\d]{24}$/i.test(templateId)) {
    query.$or.push({ _id: templateId });
  }

  const template = await Template.findOne(query);
  if (!template) return null;

  if (template.status !== 'approved' || !template.syncedAt || template.syncedAt < new Date(Date.now() - 5 * 60 * 1000)) {
    await refreshTemplateApproval(template);
  }

  return template.status === 'approved' ? template : null;
};

const buildRecipientTemplateValues = (template, recipient, school) => {
  const replacements = [
    recipient.name || 'Customer',
    school?.name || 'our team',
    recipient.phone || ''
  ];

  return extractBodyVariables(template.body).map((_, index) => replacements[index] || '');
};

const ensureMetaReady = async (schoolId) => {
  const [school, account] = await Promise.all([
    School.findById(schoolId),
    WhatsAppAccount.findOne({ schoolId })
  ]);

  const isConnected = account?.status === 'connected' || school?.whatsapp?.isConnected;
  const hasPhone = Boolean(account?.phoneNumberId || school?.whatsapp?.phoneNumberId || process.env.META_PHONE_NUMBER_ID);
  const hasWaba = Boolean(account?.wabaId || school?.whatsapp?.wabaId || process.env.META_WABA_ID);

  if (!isConnected || !hasPhone || !hasWaba) {
    throw new Error('Connect Meta WhatsApp before creating or sending broadcasts');
  }
};

// @desc    Get all broadcasts
// @route   GET /api/broadcasts
// @access  Private
exports.getBroadcasts = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    
    const query = { schoolId: req.schoolId };
    if (status) query.status = status;

    const skip = (page - 1) * limit;
    
    const [broadcasts, total] = await Promise.all([
      Broadcast.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('createdBy', 'name'),
      Broadcast.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      count: broadcasts.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      data: broadcasts
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single broadcast
// @route   GET /api/broadcasts/:id
// @access  Private
exports.getBroadcast = async (req, res) => {
  try {
    const broadcast = await Broadcast.findOne({ 
      _id: req.params.id, 
      schoolId: req.schoolId 
    }).populate('createdBy', 'name');

    if (!broadcast) {
      return res.status(404).json({
        success: false,
        message: 'Broadcast not found'
      });
    }

    res.status(200).json({
      success: true,
      data: broadcast
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Create broadcast
// @route   POST /api/broadcasts
// @access  Private
exports.createBroadcast = async (req, res) => {
  try {
    const { name, message, recipientType, recipientIds, templateId, templateVariables, scheduledAt, type, media, tagFilter } = req.body;

    await ensureMetaReady(req.schoolId);

    if (isTemplateBroadcastRequired() && !templateId) {
      return res.status(400).json({
        success: false,
        message: 'Please choose an approved WhatsApp template before sending a broadcast'
      });
    }

    let template = null;

    if (templateId) {
      template = await getApprovedTemplate(req.schoolId, templateId);
      if (!template) {
        return res.status(400).json({
          success: false,
          message: 'Template must be approved before it can be used in a broadcast'
        });
      }
      validateTemplateBroadcastPayload(template, templateVariables, media);
    }

    let recipients = [];

    if (recipientType === 'all') {
      // Get all leads
      const leads = await Lead.find({ schoolId: req.schoolId }).select('name phone');
      recipients = buildRecipients(leads);
    } else if (recipientType === 'status') {
      // Get leads by status
      const leads = await Lead.find({ 
        schoolId: req.schoolId, 
        status: req.body.statusFilter 
      }).select('name phone');
      recipients = buildRecipients(leads);
    } else if (recipientType === 'tag') {
      const leads = await Lead.find({
        schoolId: req.schoolId,
        tags: tagFilter
      }).select('name phone');
      recipients = buildRecipients(leads);
    } else if (recipientType === 'selected') {
      // Get specific leads
      const leads = await Lead.find({ 
        _id: { $in: recipientIds },
        schoolId: req.schoolId 
      }).select('name phone');
      recipients = buildRecipients(leads);
    }

    if (recipients.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid WhatsApp recipients found. Add contacts with country-code phone numbers before creating the broadcast.'
      });
    }

    const broadcast = await Broadcast.create({
      schoolId: req.schoolId,
      name,
      message,
      templateId,
      templateVariables: Array.isArray(templateVariables) ? templateVariables.map((value) => String(value || '').trim()) : [],
      media: media?.url ? {
        type: media.type || 'image',
        url: getPublicAssetUrl(media.url) || media.url,
        filename: media.filename
      } : undefined,
      recipients,
      totalRecipients: recipients.length,
      type: type || 'utility',
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      status: scheduledAt ? 'scheduled' : 'draft',
      createdBy: req.user.id
    });

    res.status(201).json({
      success: true,
      data: broadcast
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Upload broadcast image
// @route   POST /api/broadcasts/upload-image
// @access  Private
exports.uploadBroadcastImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload an image'
      });
    }

    const url = `/uploads/broadcasts/${req.file.filename}`;

    res.status(200).json({
      success: true,
      data: {
        type: 'image',
        url,
        publicUrl: getPublicAssetUrl(url),
        filename: req.file.originalname
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update broadcast
// @route   PUT /api/broadcasts/:id
// @access  Private
exports.updateBroadcast = async (req, res) => {
  try {
    const { name, message, templateId, scheduledAt } = req.body;

    let broadcast = await Broadcast.findOne({ 
      _id: req.params.id, 
      schoolId: req.schoolId 
    });

    if (!broadcast) {
      return res.status(404).json({
        success: false,
        message: 'Broadcast not found'
      });
    }

    // Only allow editing draft broadcasts
    if (broadcast.status !== 'draft' && broadcast.status !== 'scheduled') {
      return res.status(400).json({
        success: false,
        message: 'Cannot edit broadcast after processing started'
      });
    }

    broadcast = await Broadcast.findByIdAndUpdate(
      req.params.id,
      { name, message, templateId, scheduledAt },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      data: broadcast
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete broadcast
// @route   DELETE /api/broadcasts/:id
// @access  Private
exports.deleteBroadcast = async (req, res) => {
  try {
    const broadcast = await Broadcast.findOne({ 
      _id: req.params.id, 
      schoolId: req.schoolId 
    });

    if (!broadcast) {
      return res.status(404).json({
        success: false,
        message: 'Broadcast not found'
      });
    }

    // Only allow deleting draft broadcasts
    if (broadcast.status === 'processing') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete broadcast while processing'
      });
    }

    await broadcast.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Broadcast deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Start broadcast
// @route   POST /api/broadcasts/:id/start
// @access  Private
exports.startBroadcast = async (req, res) => {
  try {
    await ensureMetaReady(req.schoolId);

    let broadcast = await Broadcast.findOne({ 
      _id: req.params.id, 
      schoolId: req.schoolId 
    });

    if (!broadcast) {
      return res.status(404).json({
        success: false,
        message: 'Broadcast not found'
      });
    }

    if (broadcast.status !== 'draft' && broadcast.status !== 'scheduled') {
      return res.status(400).json({
        success: false,
        message: 'Broadcast already started or completed'
      });
    }

    if (broadcast.totalRecipients === 0) {
      return res.status(400).json({
        success: false,
        message: 'No recipients to send'
      });
    }

    if (isTemplateBroadcastRequired()) {
      const template = await getApprovedTemplate(req.schoolId, broadcast.templateId);
      if (!template) {
        return res.status(400).json({
          success: false,
          message: 'Broadcasts must use an approved WhatsApp template'
        });
      }
      validateTemplateBroadcastPayload(template, broadcast.templateVariables, broadcast.media);
    }

    // Update status
    broadcast.status = 'processing';
    broadcast.startedAt = new Date();
    await broadcast.save();

    // Start processing in background
    processBroadcast(broadcast._id);

    res.status(200).json({
      success: true,
      message: 'Broadcast started',
      data: broadcast
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Process broadcast in background
const processBroadcast = async (broadcastId) => {
  try {
    const broadcast = await Broadcast.findById(broadcastId);
    const school = await School.findById(broadcast.schoolId).select('name');
    const whatsappService = createWhatsAppService(broadcast.schoolId);
    const template = broadcast.templateId
      ? await getApprovedTemplate(broadcast.schoolId, broadcast.templateId)
      : null;

    if (isTemplateBroadcastRequired() && !template) {
      broadcast.status = 'failed';
      broadcast.completedAt = new Date();
      broadcast.recipients.forEach((recipient) => {
        if (recipient.status === 'pending') {
          recipient.status = 'failed';
          recipient.error = 'Approved WhatsApp template is required for broadcasts';
        }
      });
      broadcast.failedCount = broadcast.recipients.length;
      await broadcast.save();
      return;
    }

    const batchSize = 100;
    const delayBetweenBatches = 3000;

    for (let i = 0; i < broadcast.recipients.length; i += batchSize) {
      const batch = broadcast.recipients.slice(i, i + batchSize);
      
      for (const recipient of batch) {
        try {
          const normalizedPhone = normalizeWhatsAppPhone(recipient.phone);
          if (!normalizedPhone) {
            throw new Error('Invalid WhatsApp phone number. Use country code format, for example 919999999999.');
          }
          const mediaUrl = getPublicAssetUrl(broadcast.media?.url);
          const templateName = template?.name;
          const customValues = Array.isArray(broadcast.templateVariables)
            ? broadcast.templateVariables.filter((value) => value !== undefined && value !== null)
            : [];
          const variables = template
            ? {
                language: template.language || 'en_US',
                values: customValues.length
                  ? customValues.map((value) => String(value)
                    .replace(/\{\{\s*lead_name\s*\}\}/gi, recipient.name || 'Customer')
                    .replace(/\{\{\s*school_name\s*\}\}/gi, school?.name || 'our team')
                    .replace(/\{\{\s*phone\s*\}\}/gi, recipient.phone || ''))
                  : buildRecipientTemplateValues(template, recipient, school),
                headerImageUrl: template.header?.type === 'image' ? mediaUrl : undefined
              }
            : {};
          const result = templateName
            ? await whatsappService.sendTemplateMessage(normalizedPhone, templateName, variables)
            : mediaUrl
              ? await whatsappService.sendImageMessage(normalizedPhone, mediaUrl, broadcast.message)
              : await whatsappService.sendMessage(normalizedPhone, broadcast.message);
          
          const recipientIndex = broadcast.recipients.findIndex(
            r => r.phone === recipient.phone
          );

          if (result.success) {
            broadcast.recipients[recipientIndex].status = 'sent';
            broadcast.recipients[recipientIndex].messageId = result.messageId;
            broadcast.recipients[recipientIndex].sentAt = new Date();
            broadcast.sentCount += 1;
          } else {
            broadcast.recipients[recipientIndex].status = 'failed';
            broadcast.recipients[recipientIndex].error = result.error;
            broadcast.failedCount += 1;
          }
        } catch (error) {
          const recipientIndex = broadcast.recipients.findIndex(
            r => r.phone === recipient.phone
          );
          broadcast.recipients[recipientIndex].status = 'failed';
          broadcast.recipients[recipientIndex].error = error.message;
          broadcast.failedCount += 1;
        }
      }

      broadcast.currentBatch = Math.floor(i / batchSize) + 1;
      await broadcast.save();

      // Delay between batches
      if (i + batchSize < broadcast.recipients.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    // Update final status
    broadcast.status = 'completed';
    broadcast.completedAt = new Date();
    await broadcast.save();

    // Update school analytics
    await School.findByIdAndUpdate(broadcast.schoolId, {
      $inc: {
        'analytics.totalMessagesSent': broadcast.sentCount
      }
    });

  } catch (error) {
    console.error('Broadcast processing error:', error);
    const broadcast = await Broadcast.findById(broadcastId);
    broadcast.status = 'failed';
    await broadcast.save();
  }
};

// @desc    Get broadcast stats
// @route   GET /api/broadcasts/stats
// @access  Private
exports.getBroadcastStats = async (req, res) => {
  try {
    const stats = await Broadcast.aggregate([
      { $match: { schoolId: req.schoolId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalRecipients: { $sum: '$totalRecipients' },
          totalSent: { $sum: '$sentCount' }
        }
      }
    ]);

    const formattedStats = {
      draft: 0,
      scheduled: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0
    };

    stats.forEach(stat => {
      formattedStats[stat._id] = stat.count;
    });

    res.status(200).json({
      success: true,
      data: formattedStats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.processDueScheduledBroadcasts = async () => {
  const dueBroadcasts = await Broadcast.find({
    status: 'scheduled',
    scheduledAt: { $lte: new Date() }
  }).select('_id');

  for (const broadcast of dueBroadcasts) {
    await Broadcast.findByIdAndUpdate(broadcast._id, {
      status: 'processing',
      startedAt: new Date()
    });
    processBroadcast(broadcast._id);
  }
};
