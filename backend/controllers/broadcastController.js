const mongoose = require('mongoose');
const crypto = require('crypto');
const Broadcast = require('../models/Broadcast');
const Lead = require('../models/Lead');
const Message = require('../models/Message');
const School = require('../models/School');
const Template = require('../models/Template');
const WhatsAppAccount = require('../models/WhatsAppAccount');
const { createWhatsAppService } = require('../services/whatsappService');
const { uploadFileToCloudinary } = require('../services/cloudinaryService');
const { decryptSecret } = require('../utils/tokenVault');
const { compactMessageRecord } = require('../utils/storagePolicy');
const activeBroadcasts = new Set();
const DELIVERED_STATUSES = ['sent', 'delivered', 'read'];

const toObjectId = (value) => {
  if (value instanceof mongoose.Types.ObjectId) return value;
  return mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : value;
};

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

const readPositiveInt = (value, fallback, max = 500) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(Math.floor(number), max);
};

const getDuplicateSuppressionMs = () => readPositiveInt(
  process.env.BROADCAST_DUPLICATE_SUPPRESSION_MS,
  24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000
);

const getBroadcastLockMs = () => readPositiveInt(
  process.env.BROADCAST_WORKER_LOCK_MS,
  30 * 60 * 1000,
  6 * 60 * 60 * 1000
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runWithConcurrency = async (items, concurrency, worker) => {
  const results = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
};

const countRecipientStatuses = (recipients = []) => ({
  sentCount: recipients.filter((item) => DELIVERED_STATUSES.includes(item.status)).length,
  deliveredCount: recipients.filter((item) => ['delivered', 'read'].includes(item.status)).length,
  readCount: recipients.filter((item) => item.status === 'read').length,
  failedCount: recipients.filter((item) => item.status === 'failed').length
});

const compactSetUpdate = (update = {}) => Object.fromEntries(
  Object.entries(update).filter(([, value]) => value !== undefined)
);

const invalidRecipientPhoneResult = () => ({
  success: false,
  error: 'Invalid WhatsApp phone number. Use country code format, for example 919999999999.',
  errorCode: 'INVALID_PHONE_NUMBER',
  retryable: false
});

const shouldRequeueRecipient = (failure, attemptNumber, maxAttempts) => {
  return failure?.retryable === true && attemptNumber < maxAttempts;
};

const buildRecipientFailureSet = (failure, attemptNumber, maxAttempts) => {
  const requeue = shouldRequeueRecipient(failure, attemptNumber, maxAttempts);
  return compactSetUpdate({
    'recipients.$.status': requeue ? 'pending' : 'failed',
    'recipients.$.error': failure.error || failure.message,
    'recipients.$.errorCode': failure.errorCode || failure.code,
    'recipients.$.errorDetails': failure.errorDetails || failure.details,
    'recipients.$.retryable': failure.retryable,
    'recipients.$.lastAttemptAt': new Date(),
    'recipients.$.failedAt': requeue ? undefined : new Date()
  });
};

const createWorkerLockId = () => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
};

const acquireBroadcastLock = async (broadcastId) => {
  const lockId = createWorkerLockId();
  const staleLockCutoff = new Date(Date.now() - getBroadcastLockMs());
  const broadcast = await Broadcast.findOneAndUpdate(
    {
      _id: broadcastId,
      $or: [
        { 'processingLock.lockedAt': { $exists: false } },
        { 'processingLock.lockedAt': { $lte: staleLockCutoff } }
      ]
    },
    {
      $set: {
        processingLock: {
          lockId,
          lockedAt: new Date()
        }
      }
    },
    { new: true }
  );

  return broadcast ? { broadcast, lockId } : null;
};

const releaseBroadcastLock = (broadcastId, lockId) => Broadcast.updateOne(
  { _id: broadcastId, 'processingLock.lockId': lockId },
  { $unset: { processingLock: '' } }
);

const refreshBroadcastCounters = async (broadcastId, options = {}) => {
  const broadcast = await Broadcast.findById(broadcastId);
  if (!broadcast) return null;

  const counts = countRecipientStatuses(broadcast.recipients);
  const update = { ...counts };

  if (options.currentBatch !== undefined) update.currentBatch = options.currentBatch;
  if (options.finalize) {
    const hasPending = broadcast.recipients.some((item) => item.status === 'pending' || item.status === 'processing');
    update.status = hasPending ? 'processing' : 'completed';
    update.completedAt = new Date();
  }

  await Broadcast.updateOne({ _id: broadcastId }, { $set: update });
  return { ...broadcast.toObject(), ...update };
};

const reconcileBroadcastWithMessageLedger = async (broadcast) => {
  const ids = (broadcast.recipients || [])
    .map((recipient) => recipient.messageId)
    .filter(Boolean);

  if (!ids.length) return broadcast;

  const messages = await Message.find({ metaMessageId: { $in: ids } })
    .select('metaMessageId status deliveredAt readAt failedAt')
    .lean();
  const messageById = new Map(messages.map((message) => [message.metaMessageId, message]));
  let changed = false;

  broadcast.recipients.forEach((recipient) => {
    const message = messageById.get(recipient.messageId);
    if (!message) return;

    if (message.status && recipient.status !== message.status) {
      recipient.status = message.status;
      changed = true;
    }
    ['deliveredAt', 'readAt', 'failedAt'].forEach((field) => {
      if (message[field] && !recipient[field]) {
        recipient[field] = message[field];
        changed = true;
      }
    });
  });

  if (!changed) return broadcast;

  const counts = countRecipientStatuses(broadcast.recipients);
  await Broadcast.updateOne(
    { _id: broadcast._id },
    {
      $set: {
        recipients: broadcast.recipients,
        ...counts
      }
    }
  );
  return Object.assign(broadcast, counts);
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

const normalizeColumnKey = (value = '') => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');

const isPhoneColumn = (column = '') => {
  const key = normalizeColumnKey(column);
  return [
    'phone',
    'mobile',
    'number',
    'phoneno',
    'mobileno',
    'contactno',
    'whatsapp',
    'whatsappno',
    'contact',
    'cell',
    'cellphone'
  ].includes(key)
    || key.includes('phonenumber')
    || key.includes('mobilenumber')
    || key.includes('whatsappnumber')
    || key.includes('contactnumber');
};

const getRowPhoneValue = (row = {}) => {
  const phoneEntry = Object.entries(row).find(([key]) => isPhoneColumn(key));
  return phoneEntry ? phoneEntry[1] : '';
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

const buildCsvRecipients = (rows = []) => {
  const seen = new Set();
  return rows.reduce((items, row) => {
    if (!row || typeof row !== 'object') return items;
    const sourcePhone = getRowPhoneValue(row);
    const phone = normalizeWhatsAppPhone(sourcePhone);
    if (!phone || seen.has(phone)) return items;
    seen.add(phone);

    const variables = Object.entries(row).reduce((data, [key, value]) => {
      const cleanKey = String(key || '').trim();
      if (!cleanKey || isPhoneColumn(cleanKey)) return data;
      data[cleanKey] = value == null ? '' : String(value).trim();
      return data;
    }, {});

    items.push({
      phone,
      name: row.Name || row.name || variables.DriverName || 'Customer',
      variables
    });
    return items;
  }, []);
};

const broadcastEligibleLeadQuery = (schoolId, extra = {}) => ({
  schoolId,
  marketingOptOut: { $ne: true },
  tags: { $nin: ['opted_out', 'do_not_send', 'unsubscribe', 'unsubscribed', 'stop'] },
  ...extra
});

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

const resolveTemplateVariableValue = (value, recipient, school) => {
  const rowVariables = recipient.variables && typeof recipient.variables === 'object' ? recipient.variables : {};
  const context = {
    lead_name: recipient.name || 'Customer',
    name: recipient.name || 'Customer',
    school_name: school?.name || 'our team',
    phone: recipient.phone || '',
    ...rowVariables
  };
  const normalizedContext = Object.entries(context).reduce((items, [key, item]) => {
    items[String(key).toLowerCase()] = item == null ? '' : String(item);
    return items;
  }, {});

  return String(value || '').replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, key) => {
    const exact = context[key];
    if (exact !== undefined && exact !== null) return String(exact);
    const normalized = normalizedContext[String(key).toLowerCase()];
    return normalized !== undefined ? normalized : '';
  });
};

const findRecentOutboundDuplicate = async ({ schoolId, phone, message, messageType }) => {
  if (process.env.BROADCAST_SUPPRESS_RECENT_DUPLICATES === 'false') return null;

  const duplicateWindowMs = getDuplicateSuppressionMs();
  const query = {
    schoolId,
    userNumber: phone,
    direction: 'outbound',
    status: { $in: DELIVERED_STATUSES },
    message: String(message || ''),
    messageType,
    createdAt: { $gte: new Date(Date.now() - duplicateWindowMs) }
  };

  return Message.findOne(query)
    .sort({ createdAt: -1 })
    .select('metaMessageId status sentAt deliveredAt readAt createdAt')
    .lean();
};

const findSameBroadcastDelivery = (broadcast, phone) => {
  return (broadcast.recipients || []).find((recipient) => {
    if (!recipient.messageId || !DELIVERED_STATUSES.includes(recipient.status)) return false;
    return normalizeWhatsAppPhone(recipient.phone) === phone;
  });
};

const buildDuplicateRecipientSet = (duplicate) => {
  const sentAt = duplicate.sentAt || duplicate.createdAt || new Date();
  const recipientSet = {
    'recipients.$.status': DELIVERED_STATUSES.includes(duplicate.status) ? duplicate.status : 'sent',
    'recipients.$.messageId': duplicate.messageId || duplicate.metaMessageId,
    'recipients.$.sentAt': sentAt
  };

  if (duplicate.deliveredAt) recipientSet['recipients.$.deliveredAt'] = duplicate.deliveredAt;
  if (duplicate.readAt) recipientSet['recipients.$.readAt'] = duplicate.readAt;

  return recipientSet;
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
    
    let [broadcasts, total] = await Promise.all([
      Broadcast.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('createdBy', 'name'),
      Broadcast.countDocuments(query)
    ]);
    broadcasts = await Promise.all(broadcasts.map((broadcast) => reconcileBroadcastWithMessageLedger(broadcast)));

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
    let broadcast = await Broadcast.findOne({
      _id: req.params.id, 
      schoolId: req.schoolId 
    }).populate('createdBy', 'name');

    if (!broadcast) {
      return res.status(404).json({
        success: false,
        message: 'Broadcast not found'
      });
    }

    broadcast = await reconcileBroadcastWithMessageLedger(broadcast);

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
    const { name, message, recipientType, recipientIds, templateId, templateVariables, scheduledAt, type, media, tagFilter, csvRecipients } = req.body;

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
      const leads = await Lead.find(broadcastEligibleLeadQuery(req.schoolId)).select('name phone');
      recipients = buildRecipients(leads);
    } else if (recipientType === 'status') {
      // Get leads by status
      const leads = await Lead.find(broadcastEligibleLeadQuery(req.schoolId, {
        status: req.body.statusFilter 
      })).select('name phone');
      recipients = buildRecipients(leads);
    } else if (recipientType === 'tag') {
      const leads = await Lead.find(broadcastEligibleLeadQuery(req.schoolId, {
        tags: tagFilter
      })).select('name phone');
      recipients = buildRecipients(leads);
    } else if (recipientType === 'selected') {
      // Get specific leads
      const leads = await Lead.find(broadcastEligibleLeadQuery(req.schoolId, {
        _id: { $in: recipientIds },
      })).select('name phone');
      recipients = buildRecipients(leads);
    } else if (recipientType === 'csv') {
      recipients = buildCsvRecipients(Array.isArray(csvRecipients) ? csvRecipients : []);
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

    let cloudinary = null;
    try {
      cloudinary = await uploadFileToCloudinary(req.file, {
        folder: `waauto/${req.schoolId}/broadcasts`
      });
    } catch (error) {
      console.warn('Cloudinary broadcast upload failed, using local upload:', error.message);
    }

    const localUrl = `/uploads/broadcasts/${req.file.filename}`;
    const url = cloudinary?.url || localUrl;

    res.status(200).json({
      success: true,
      data: {
        type: 'image',
        url,
        publicUrl: cloudinary?.url || getPublicAssetUrl(url),
        storage: cloudinary ? 'cloudinary' : 'local',
        publicId: cloudinary?.publicId,
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

// @desc    Resume pending recipients in an interrupted broadcast
// @route   POST /api/broadcasts/:id/resume
// @access  Private
exports.resumeBroadcast = async (req, res) => {
  try {
    await ensureMetaReady(req.schoolId);
    const retryFailed = req.body?.retryFailed === true;

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

    let retriedFailedCount = 0;
    if (retryFailed) {
      broadcast.recipients.forEach((recipient) => {
        if (recipient.status === 'failed' && recipient.retryable !== false) {
          recipient.status = 'pending';
          recipient.error = undefined;
          recipient.errorCode = undefined;
          recipient.errorDetails = undefined;
          recipient.retryable = undefined;
          recipient.sendAttempts = 0;
          recipient.lastAttemptAt = undefined;
          recipient.failedAt = undefined;
          retriedFailedCount += 1;
        }
      });
    }

    const pendingCount = broadcast.recipients.filter((recipient) => recipient.status === 'pending').length;
    if (!pendingCount) {
      return res.status(400).json({
        success: false,
        message: retryFailed
          ? 'No failed recipients left to retry in this broadcast'
          : 'No pending recipients left in this broadcast'
      });
    }

    broadcast.status = 'processing';
    broadcast.startedAt = broadcast.startedAt || new Date();
    if (retryFailed) {
      const counts = countRecipientStatuses(broadcast.recipients);
      broadcast.sentCount = counts.sentCount;
      broadcast.deliveredCount = counts.deliveredCount;
      broadcast.readCount = counts.readCount;
      broadcast.failedCount = counts.failedCount;
    }
    await broadcast.save();
    processBroadcast(broadcast._id);

    res.status(200).json({
      success: true,
      message: retryFailed
        ? `Retry started for ${retriedFailedCount} failed recipient(s)`
        : `Broadcast resumed for ${pendingCount} pending recipient(s)`,
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
  const workerKey = String(broadcastId);
  if (activeBroadcasts.has(workerKey)) return;
  activeBroadcasts.add(workerKey);
  let lockId = null;

  try {
    const lock = await acquireBroadcastLock(broadcastId);
    if (!lock) return;

    lockId = lock.lockId;
    const broadcast = lock.broadcast;
    if (!broadcast) return;
    const school = await School.findById(broadcast.schoolId).select('name whatsapp');
    const whatsappService = createWhatsAppService(broadcast.schoolId);
    const whatsappConfig = await whatsappService.getSchoolConfig();
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
          recipient.failedAt = new Date();
        }
      });
      broadcast.failedCount = broadcast.recipients.length;
      await broadcast.save();
      return;
    }

    const batchSize = readPositiveInt(process.env.BROADCAST_BATCH_SIZE, 50, 500);
    const sendConcurrency = readPositiveInt(process.env.BROADCAST_SEND_CONCURRENCY, 1, 50);
    const delayBetweenBatches = readPositiveInt(process.env.BROADCAST_BATCH_DELAY_MS, 3000, 60000);
    const delayBetweenMessages = readPositiveInt(process.env.BROADCAST_SEND_DELAY_MS, 750, 10000);
    const maxRecipientAttempts = readPositiveInt(process.env.BROADCAST_RECIPIENT_RETRIES, 5, 20);

    const seenPendingPhones = new Set();
    const pendingRecipients = broadcast.recipients.filter((recipient) => {
      if (recipient.status !== 'pending') return false;
      const phone = normalizeWhatsAppPhone(recipient.phone);
      if (!phone || seenPendingPhones.has(phone)) return false;
      seenPendingPhones.add(phone);
      return true;
    });
    let claimedTotal = 0;

    for (let i = 0; i < pendingRecipients.length; i += batchSize) {
      const batch = pendingRecipients.slice(i, i + batchSize);

      const messageWrites = [];
      const batchResults = await runWithConcurrency(batch, sendConcurrency, async (recipient) => {
        try {
          const claim = await Broadcast.updateOne(
            {
              _id: broadcast._id,
              recipients: {
                $elemMatch: {
                  phone: recipient.phone,
                  status: 'pending'
                }
              }
            },
            {
              $set: {
                'recipients.$.status': 'processing',
                'recipients.$.lastAttemptAt': new Date()
              },
              $inc: {
                'recipients.$.sendAttempts': 1
              }
            }
          );

          if (!claim.modifiedCount) {
            return { skipped: true };
          }

          const normalizedPhone = normalizeWhatsAppPhone(recipient.phone);
          const attemptNumber = Number(recipient.sendAttempts || 0) + 1;
          const mediaUrl = getPublicAssetUrl(broadcast.media?.url);
          const templateName = template?.name;
          const customValues = Array.isArray(broadcast.templateVariables)
            ? broadcast.templateVariables.filter((value) => value !== undefined && value !== null)
            : [];
          const variables = template
            ? {
                language: template.language || 'en_US',
                values: customValues.length
                  ? customValues.map((value) => resolveTemplateVariableValue(value, recipient, school))
                  : buildRecipientTemplateValues(template, recipient, school),
                headerImageUrl: template.header?.type === 'image' ? mediaUrl : undefined
              }
            : {};
          const result = !normalizedPhone
            ? invalidRecipientPhoneResult()
            : null;

          if (!result) {
            const messageBody = template?.body || broadcast.message;
            const messageType = templateName ? 'template' : mediaUrl ? 'image' : 'text';
            const sameBroadcastDuplicate = findSameBroadcastDelivery(broadcast, normalizedPhone);
            const duplicateRecipientSet = sameBroadcastDuplicate
              ? buildDuplicateRecipientSet(sameBroadcastDuplicate)
              : null;
            if (duplicateRecipientSet) {
              await Broadcast.updateOne(
                {
                  _id: broadcast._id,
                  recipients: {
                    $elemMatch: {
                      phone: recipient.phone,
                      status: 'processing'
                    }
                  }
                },
                {
                  $set: duplicateRecipientSet,
                  $unset: {
                    'recipients.$.error': '',
                    'recipients.$.errorCode': '',
                    'recipients.$.errorDetails': '',
                    'recipients.$.retryable': '',
                    'recipients.$.failedAt': ''
                  }
                }
              );

              return { success: true, duplicateSkipped: true };
            }

            const recentDuplicate = await findRecentOutboundDuplicate({
              schoolId: broadcast.schoolId,
              phone: normalizedPhone,
              message: messageBody,
              messageType
            });

            if (recentDuplicate) {
              await Broadcast.updateOne(
                {
                  _id: broadcast._id,
                  recipients: {
                    $elemMatch: {
                      phone: recipient.phone,
                      status: 'processing'
                    }
                  }
                },
                {
                  $set: buildDuplicateRecipientSet(recentDuplicate),
                  $unset: {
                    'recipients.$.error': '',
                    'recipients.$.errorCode': '',
                    'recipients.$.errorDetails': '',
                    'recipients.$.retryable': '',
                    'recipients.$.failedAt': ''
                  }
                }
              );

              return { success: true, duplicateSkipped: true };
            }
          }

          const sendResult = result || (templateName
            ? await whatsappService.sendTemplateMessage(normalizedPhone, templateName, variables)
            : mediaUrl
              ? await whatsappService.sendImageMessage(normalizedPhone, mediaUrl, broadcast.message)
              : await whatsappService.sendMessage(normalizedPhone, broadcast.message));

          if (sendResult.success) {
            const sentAt = new Date();
            await Broadcast.updateOne(
              {
                _id: broadcast._id,
                recipients: {
                  $elemMatch: {
                    phone: recipient.phone,
                    status: 'processing'
                  }
                }
              },
              {
                $set: {
                  'recipients.$.status': 'sent',
                  'recipients.$.messageId': sendResult.messageId,
                  'recipients.$.sentAt': sentAt
                },
                $unset: {
                  'recipients.$.error': '',
                  'recipients.$.errorCode': '',
                  'recipients.$.errorDetails': '',
                  'recipients.$.retryable': '',
                  'recipients.$.failedAt': ''
                }
              }
            );

            messageWrites.push({
              updateOne: {
                filter: { metaMessageId: sendResult.messageId },
                update: {
                  $set: compactMessageRecord({
                    schoolId: broadcast.schoolId,
                    leadId: recipient.leadId,
                    phoneNumberId: whatsappConfig.phoneNumberId || school.whatsapp?.phoneNumberId,
                    wabaId: whatsappConfig.wabaId || school.whatsapp?.wabaId,
                    userNumber: normalizedPhone,
                    direction: 'outbound',
                    message: template?.body || broadcast.message,
                    messageType: templateName ? 'template' : mediaUrl ? 'image' : 'text',
                    metaMessageId: sendResult.messageId,
                    status: 'sent',
                    sentAt,
                    rawPayload: {
                      source: 'broadcast',
                      broadcastId: broadcast._id,
                      templateName,
                      templateVariables: variables?.values || []
                    }
                  })
                },
                upsert: true
              }
            });

            return { success: true };
          }

          await Broadcast.updateOne(
            {
              _id: broadcast._id,
              recipients: {
                $elemMatch: {
                  phone: recipient.phone,
                  status: 'processing'
                }
              }
            },
            {
              $set: buildRecipientFailureSet(sendResult, attemptNumber, maxRecipientAttempts)
            }
          );
          return { success: false };
        } catch (error) {
          await Broadcast.updateOne(
            {
              _id: broadcast._id,
              recipients: {
                $elemMatch: {
                  phone: recipient.phone,
                  status: 'processing'
                }
              }
            },
            {
              $set: buildRecipientFailureSet(error, Number(recipient.sendAttempts || 0) + 1, maxRecipientAttempts)
            }
          );
          return { success: false };
        } finally {
          if (delayBetweenMessages > 0) {
            await sleep(delayBetweenMessages);
          }
        }
      });

      const claimedResults = batchResults.filter((result) => result && !result.skipped);
      claimedTotal += claimedResults.length;
      if (!claimedResults.length) {
        continue;
      }

      if (messageWrites.length) {
        await Message.bulkWrite(messageWrites, { ordered: false });
      }

      await refreshBroadcastCounters(broadcast._id, {
        currentBatch: Math.floor(i / batchSize) + 1
      });

      // Delay between batches
      if (i + batchSize < pendingRecipients.length) {
        await sleep(delayBetweenBatches);
      }
    }

    if (!claimedTotal) {
      return;
    }

    await Broadcast.updateOne(
      { _id: broadcast._id },
      { $set: { 'recipients.$[recipient].status': 'pending' } },
      { arrayFilters: [{ 'recipient.status': 'processing' }] }
    );
    const finalBroadcast = await refreshBroadcastCounters(broadcast._id, { finalize: true });

    // Update school analytics
    await School.findByIdAndUpdate(broadcast.schoolId, {
      $inc: {
        'analytics.totalMessagesSent': finalBroadcast?.sentCount || 0
      }
    });

  } catch (error) {
    console.error('Broadcast processing error:', error);
    const broadcast = await Broadcast.findById(broadcastId);
    if (broadcast) {
      await Broadcast.updateOne(
        { _id: broadcast._id },
        {
          $set: {
            status: 'failed',
            'recipients.$[recipient].status': 'pending'
          }
        },
        { arrayFilters: [{ 'recipient.status': 'processing' }] }
      );
    }
  } finally {
    if (lockId) {
      await releaseBroadcastLock(broadcastId, lockId);
    }
    activeBroadcasts.delete(workerKey);
  }
};

// @desc    Get broadcast stats
// @route   GET /api/broadcasts/stats
// @access  Private
exports.getBroadcastStats = async (req, res) => {
  try {
    const schoolId = toObjectId(req.schoolId);
    const [statusStats, recipientStats] = await Promise.all([
      Broadcast.aggregate([
        { $match: { schoolId } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]),
      Broadcast.aggregate([
        { $match: { schoolId } },
        { $unwind: { path: '$recipients', preserveNullAndEmptyArrays: false } },
        {
          $group: {
            _id: null,
            totalRecipients: { $sum: 1 },
            totalSent: {
              $sum: {
                $cond: [{ $in: ['$recipients.status', ['sent', 'delivered', 'read']] }, 1, 0]
              }
            },
            totalDelivered: {
              $sum: {
                $cond: [{ $in: ['$recipients.status', ['delivered', 'read']] }, 1, 0]
              }
            },
            totalRead: {
              $sum: {
                $cond: [{ $eq: ['$recipients.status', 'read'] }, 1, 0]
              }
            },
            totalFailed: {
              $sum: {
                $cond: [{ $eq: ['$recipients.status', 'failed'] }, 1, 0]
              }
            },
            totalPending: {
              $sum: {
                $cond: [{ $eq: ['$recipients.status', 'pending'] }, 1, 0]
              }
            },
            totalProcessing: {
              $sum: {
                $cond: [{ $eq: ['$recipients.status', 'processing'] }, 1, 0]
              }
            }
          }
        }
      ])
    ]);

    const formattedStats = {
      draft: 0,
      scheduled: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      totalRecipients: 0,
      totalSent: 0,
      totalDelivered: 0,
      totalRead: 0,
      totalFailed: 0,
      totalPending: 0,
      totalProcessing: 0
    };

    statusStats.forEach(stat => {
      formattedStats[stat._id] = stat.count;
    });

    Object.assign(formattedStats, recipientStats[0] || {});
    delete formattedStats._id;

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
  const staleProcessingMs = readPositiveInt(process.env.BROADCAST_PROCESSING_STALE_MS, 10 * 60 * 1000, 60 * 60 * 1000);
  const staleCutoff = new Date(Date.now() - staleProcessingMs);
  const broadcasts = await Broadcast.find({
    $or: [
      { status: 'scheduled', scheduledAt: { $lte: new Date() } },
      { status: 'processing', 'recipients.status': 'pending' },
      {
        status: 'processing',
        recipients: {
          $elemMatch: {
            status: 'processing',
            $or: [
              { lastAttemptAt: { $lte: staleCutoff } },
              { lastAttemptAt: { $exists: false } }
            ]
          }
        }
      },
      { status: 'failed', 'recipients.status': 'pending' }
    ]
  }).select('_id');

  for (const broadcast of broadcasts) {
    const recoverySet = {
      status: 'processing',
      startedAt: new Date(),
      'recipients.$[recipient].status': 'pending'
    };

    await Broadcast.updateOne(
      { _id: broadcast._id },
      { $set: recoverySet },
      {
        arrayFilters: [{
          'recipient.status': 'processing',
          'recipient.lastAttemptAt': { $lte: staleCutoff }
        }]
      }
    );

    await Broadcast.updateOne(
      { _id: broadcast._id },
      { $set: recoverySet },
      {
        arrayFilters: [{
          'recipient.status': 'processing',
          'recipient.lastAttemptAt': { $exists: false }
        }]
      }
    );
    processBroadcast(broadcast._id);
  }
};
