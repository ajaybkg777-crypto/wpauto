const Template = require('../models/Template');
const WhatsAppAccount = require('../models/WhatsAppAccount');
const School = require('../models/School');
const { decryptSecret } = require('../utils/tokenVault');

const getPublicAssetUrl = (assetPath) => {
  if (!assetPath) return '';
  if (/^https?:\/\//i.test(assetPath)) return assetPath;
  if (!process.env.APP_BASE_URL) return '';

  return `${process.env.APP_BASE_URL.replace(/\/$/, '')}${assetPath}`;
};

const isMetaMediaHandle = (value = '') => {
  return /^[A-Za-z0-9_-]+::/.test(String(value)) || /^h:[A-Za-z0-9_-]+/i.test(String(value));
};

const getMetaGraphBaseUrl = () => {
  const version = process.env.META_GRAPH_API_VERSION || 'v25.0';
  return `https://graph.facebook.com/${version}`;
};

const extractBodyVariables = (body = '') => {
  const matches = String(body).match(/{{\s*\d+\s*}}/g) || [];
  return [...new Set(matches.map((match) => match.replace(/[{}\s]/g, '')))]
    .sort((left, right) => Number(left) - Number(right));
};

const getBodyExampleValues = (template) => {
  const variables = extractBodyVariables(template.body);
  if (!variables.length) return undefined;

  const sampleValues = String(template.sampleText || '')
    .split('|')
    .map((value) => value.trim())
    .filter(Boolean);

  return variables.map((variable, index) => sampleValues[index] || `sample ${variable}`);
};

const normalizeTemplateName = (name = '') => String(name)
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9_]+/g, '_')
  .replace(/_+/g, '_')
  .replace(/^_|_$/g, '');

const normalizeLanguage = (language = 'en_US') => String(language || 'en_US').trim() || 'en_US';

const normalizePhoneNumber = (phone = '') => {
  const value = String(phone || '').trim();
  const digits = value.replace(/\D/g, '');

  if (/^\+\d{10,15}$/.test(value.replace(/[^\d+]/g, ''))) {
    return `+${digits}`;
  }

  if (/^[6-9]\d{9}$/.test(digits)) {
    return `+91${digits}`;
  }

  if (/^[1-9]\d{9,14}$/.test(digits)) {
    return `+${digits}`;
  }

  return '';
};

const isValidPhoneNumber = (phone = '') => {
  const normalized = normalizePhoneNumber(phone);
  return /^\+[1-9]\d{9,14}$/.test(normalized);
};

const normalizeButtons = (buttons = []) => (Array.isArray(buttons) ? buttons : [])
  .map((button) => ({
    type: button.type === 'quick_reply' ? 'custom' : button.type,
    text: String(button.text || '').trim(),
    url: String(button.url || '').trim(),
    phoneNumber: String(button.phoneNumber || '').trim(),
    offerCode: String(button.offerCode || '').trim().toUpperCase()
  }))
  .filter((button) => button.type && button.text);

const sanitizeTemplatePayload = (payload = {}) => {
  const headerType = payload.header?.type || 'none';
  const media = ['image', 'video', 'document'].includes(headerType) && payload.media?.url
    ? {
        type: payload.media.type || headerType,
        url: getPublicAssetUrl(payload.media.url) || payload.media.url,
        filename: payload.media.filename,
        mimetype: payload.media.mimetype
      }
    : undefined;

  return {
    name: normalizeTemplateName(payload.name),
    category: String(payload.category || 'marketing').toLowerCase(),
    language: normalizeLanguage(payload.language),
    body: String(payload.body || '').trim(),
    header: {
      type: headerType,
      text: headerType === 'text' ? String(payload.header?.text || '').trim() : ''
    },
    footer: String(payload.footer || '').trim(),
    buttons: normalizeButtons(payload.buttons),
    media,
    sampleText: String(payload.sampleText || '').trim()
  };
};

const validateSequentialVariables = (body = '') => {
  const variables = extractBodyVariables(body).map(Number);
  if (!variables.length) return;

  for (let index = 0; index < variables.length; index += 1) {
    if (variables[index] !== index + 1) {
      throw new Error('Template variables must be sequential like {{1}}, {{2}}, {{3}} without gaps');
    }
  }
};

const validateTemplateForMeta = (template, { submitting = false } = {}) => {
  if (!template.name) throw new Error('Template name is required');
  if (!/^[a-z0-9_]+$/.test(template.name)) throw new Error('Template name can only use lowercase letters, numbers, and underscores');
  if (!['marketing', 'utility', 'authentication'].includes(template.category)) throw new Error('Choose a valid Meta template category');
  if (!/^[a-z]{2}(_[A-Z]{2})?$/.test(template.language)) throw new Error('Language must look like en_US or hi_IN');
  if (!template.body) throw new Error('Template body is required');
  if (template.body.length > 1024) throw new Error('Template body must be 1024 characters or fewer');
  if ((template.footer || '').length > 60) throw new Error('Footer must be 60 characters or fewer');
  if (template.header?.type === 'text' && !template.header.text) throw new Error('Header text is required');
  if ((template.header?.text || '').length > 60) throw new Error('Header text must be 60 characters or fewer');
  if (/{{(?!\s*\d+\s*}}).*?}}/.test(template.body)) throw new Error('Variables must use Meta format: {{1}}, {{2}}, {{3}}');

  validateSequentialVariables(template.body);

  const variables = extractBodyVariables(template.body);
  const samples = String(template.sampleText || '').split('|').map((value) => value.trim());
  if (variables.some((_, index) => !samples[index])) {
    throw new Error('Every body variable needs a sample value before saving/submitting');
  }

  if (['image', 'video', 'document'].includes(template.header?.type)) {
    if (!template.media?.url) throw new Error(`${template.header.type} header requires a media sample`);
    if (template.media.type && template.media.type !== template.header.type) throw new Error('Uploaded media type must match the selected header type');
    const mediaUrl = getPublicAssetUrl(template.media.url);
    if (submitting && !mediaUrl) throw new Error('Set APP_BASE_URL and upload media again before submitting media templates to Meta');
    if (submitting && !isMetaMediaHandle(template.media.url)) {
      throw new Error('Meta image/video/document headers need a Meta media sample handle. Use None/Text header for now, or upload media through Meta media upload before submitting.');
    }
  }

  if (template.category === 'authentication') {
    throw new Error('Authentication templates need a dedicated OTP template flow. Use Marketing or Utility for this builder.');
  }

  const buttons = normalizeButtons(template.buttons);
  if (buttons.length > 10) throw new Error('Meta allows a maximum of 10 buttons');
  const actionButtons = buttons.filter((button) => ['url', 'phone_number', 'copy_offer_code', 'call_whatsapp'].includes(button.type));
  const quickReplies = buttons.filter((button) => ['custom', 'quick_reply'].includes(button.type));
  if (actionButtons.length > 2) throw new Error('Use at most 2 CTA buttons in one template');
  if (actionButtons.length && quickReplies.length) throw new Error('Do not mix quick replies with URL, call, or copy-code buttons');

  buttons.forEach((button) => {
    if (button.text.length > 25) throw new Error('Button text must be 25 characters or fewer');
    if (button.type === 'url' && !/^https?:\/\//i.test(button.url)) throw new Error('URL buttons need a valid http/https URL');
    if (button.type === 'phone_number' && !isValidPhoneNumber(button.phoneNumber)) throw new Error('Phone button needs a valid country-code number like +919999999999');
    if (button.type === 'copy_offer_code' && !button.offerCode) throw new Error('Copy-code buttons need an offer code');
  });
};

const getTemplateMetaConfig = async (schoolId) => {
  const [school, account] = await Promise.all([
    School.findById(schoolId),
    WhatsAppAccount.findOne({ schoolId }).select('+accessToken')
  ]);

  const wabaId = account?.wabaId || school?.whatsapp?.wabaId || process.env.META_WABA_ID;
  const envAccessToken = decryptSecret(process.env.META_SYSTEM_USER_ACCESS_TOKEN);
  const accountAccessToken = decryptSecret(account?.accessToken);
  const accessToken = envAccessToken || accountAccessToken;

  if (!wabaId) {
    throw new Error('WhatsApp Business Account ID is missing');
  }

  if (!accessToken) {
    throw new Error('Meta access token is missing');
  }

  return { wabaId, accessToken };
};

const buildMetaTemplatePayload = (template) => {
  const components = [];

  if (template.header?.type === 'text' && template.header?.text) {
    components.push({
      type: 'HEADER',
      format: 'TEXT',
      text: template.header.text
    });
  } else if (['image', 'video', 'document'].includes(template.header?.type) || ['image', 'video', 'document'].includes(template.media?.type)) {
    const mediaType = template.header?.type || template.media?.type;
    const mediaUrl = getPublicAssetUrl(template.media?.url);
    if (!mediaUrl || !isMetaMediaHandle(template.media?.url)) {
      throw new Error('Meta media header sample is missing. Switch Header to None/Text, or upload media through Meta first.');
    }

    components.push({
      type: 'HEADER',
      format: mediaType.toUpperCase(),
      example: {
        header_handle: [mediaUrl]
      }
    });
  } else if (template.header?.type === 'location') {
    components.push({
      type: 'HEADER',
      format: 'LOCATION'
    });
  }

  const bodyComponent = {
    type: 'BODY',
    text: template.body
  };
  const bodyExamples = getBodyExampleValues(template);

  if (bodyExamples) {
    bodyComponent.example = {
      body_text: [bodyExamples]
    };
  }

  components.push(bodyComponent);

  if (template.footer) {
    components.push({
      type: 'FOOTER',
      text: template.footer
    });
  }

  const buttons = (template.buttons || [])
    .filter((button) => button.text && button.type)
    .slice(0, 10)
    .map((button) => {
      if (button.type === 'url') {
        return {
          type: 'URL',
          text: button.text,
          url: button.url
        };
      }

      if (button.type === 'call_whatsapp') {
        const whatsappTarget = String(button.phoneNumber || '').replace(/[^\d]/g, '');
        return {
          type: 'URL',
          text: button.text,
          url: button.url || (whatsappTarget ? `https://wa.me/${whatsappTarget}` : '')
        };
      }

      if (button.type === 'phone_number') {
        return {
          type: 'PHONE_NUMBER',
          text: button.text,
          phone_number: normalizePhoneNumber(button.phoneNumber)
        };
      }

      if (button.type === 'copy_offer_code') {
        return {
          type: 'COPY_CODE',
          example: button.offerCode || button.text
        };
      }

      return {
        type: 'QUICK_REPLY',
        text: button.text
      };
    });

  if (buttons.length) {
    components.push({
      type: 'BUTTONS',
      buttons
    });
  }

  return {
    name: template.name,
    language: template.language || 'en_US',
    category: String(template.category || 'marketing').toUpperCase(),
    components
  };
};

const submitTemplateToMeta = async (template) => {
  const { wabaId, accessToken } = await getTemplateMetaConfig(template.schoolId);
  const payload = buildMetaTemplatePayload(template);
  const invalidButton = payload.components
    .find((component) => component.type === 'BUTTONS')
    ?.buttons
    ?.find((button) => (button.type === 'URL' && !button.url) || (button.type === 'PHONE_NUMBER' && !button.phone_number) || (button.type === 'COPY_CODE' && !button.example));

  if (invalidButton) {
    throw new Error('URL, phone, WhatsApp call, and copy code buttons must include their action value');
  }

  const response = await fetch(`${getMetaGraphBaseUrl()}/${wabaId}/message_templates`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json();

  if (!response.ok || data.error) {
    const detail = data.error?.error_data?.details
      || data.error?.error_user_msg
      || data.error?.fbtrace_id;
    throw new Error([data.error?.message || 'Meta template submission failed', detail].filter(Boolean).join(' - '));
  }

  return data;
};

const normalizeMetaTemplateStatus = (status) => {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'APPROVED') return 'approved';
  if (normalized === 'REJECTED' || normalized === 'PAUSED' || normalized === 'DISABLED') return 'rejected';
  if (normalized === 'PENDING' || normalized === 'IN_REVIEW') return 'pending';
  return 'pending';
};

const applyMetaTemplateStatus = (template, metaTemplate) => {
  const nextStatus = normalizeMetaTemplateStatus(metaTemplate.status);
  template.status = nextStatus;
  template.metaTemplateId = metaTemplate.id || template.metaTemplateId;
  template.category = String(metaTemplate.category || template.category || 'marketing').toLowerCase();
  template.language = metaTemplate.language || template.language;
  template.rejectionReason = metaTemplate.rejected_reason || metaTemplate.rejection_reason || undefined;
  template.syncedAt = new Date();

  if (nextStatus === 'approved') {
    template.approvedAt = template.approvedAt || new Date();
    template.rejectedAt = undefined;
  }

  if (nextStatus === 'rejected') {
    template.rejectedAt = template.rejectedAt || new Date();
    template.approvedAt = undefined;
  }
};

const getComponent = (metaTemplate, type) => {
  return (metaTemplate.components || []).find((component) => component.type === type);
};

const parseMetaTemplateComponents = (metaTemplate = {}) => {
  const headerComponent = getComponent(metaTemplate, 'HEADER');
  const bodyComponent = getComponent(metaTemplate, 'BODY');
  const footerComponent = getComponent(metaTemplate, 'FOOTER');
  const buttonsComponent = getComponent(metaTemplate, 'BUTTONS');
  const headerFormat = String(headerComponent?.format || '').toLowerCase();
  const headerType = ['text', 'image', 'video', 'document', 'location'].includes(headerFormat)
    ? headerFormat
    : 'none';

  return {
    header: {
      type: headerType,
      text: headerType === 'text' ? headerComponent?.text || '' : ''
    },
    body: bodyComponent?.text || '',
    footer: footerComponent?.text || '',
    buttons: (buttonsComponent?.buttons || []).map((button) => {
      const type = String(button.type || '').toUpperCase();
      if (type === 'URL') {
        return { type: 'url', text: button.text || 'Open', url: button.url || '', phoneNumber: '', offerCode: '' };
      }
      if (type === 'PHONE_NUMBER') {
        return { type: 'phone_number', text: button.text || 'Call', phoneNumber: button.phone_number || '', url: '', offerCode: '' };
      }
      if (type === 'COPY_CODE') {
        return { type: 'copy_offer_code', text: button.text || 'Copy code', offerCode: button.example || '', url: '', phoneNumber: '' };
      }
      return { type: 'custom', text: button.text || 'Reply', url: '', phoneNumber: '', offerCode: '' };
    })
  };
};

const fetchMetaTemplates = async (schoolId) => {
  const { wabaId, accessToken } = await getTemplateMetaConfig(schoolId);
  const url = new URL(`${getMetaGraphBaseUrl()}/${wabaId}/message_templates`);
  url.searchParams.set('fields', 'id,name,status,category,language,rejected_reason,components');
  url.searchParams.set('limit', '250');

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error?.message || 'Meta template sync failed');
  }

  return data.data || [];
};

const findMetaTemplate = async (template) => {
  const metaTemplates = await fetchMetaTemplates(template.schoolId);
  return metaTemplates.find((item) => item.id === template.metaTemplateId)
    || metaTemplates.find((item) => item.name === template.name && (!template.language || item.language === template.language))
    || metaTemplates.find((item) => item.name === template.name);
};

const deleteTemplateFromMeta = async (template) => {
  if (!template.metaTemplateId && !template.name) return null;

  const { wabaId, accessToken } = await getTemplateMetaConfig(template.schoolId);
  const url = new URL(`${getMetaGraphBaseUrl()}/${wabaId}/message_templates`);

  if (template.metaTemplateId) {
    url.searchParams.set('hsm_id', template.metaTemplateId);
  } else {
    url.searchParams.set('name', template.name);
  }

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  const data = await response.json();

  if (!response.ok || data.error) {
    const message = data.error?.message || 'Meta template deletion failed';
    const code = data.error?.code;
    if (code === 100 || /does not exist|not found/i.test(message)) {
      return data;
    }
    throw new Error(message);
  }

  return data;
};

exports.syncTemplates = async (req, res) => {
  try {
    const [templates, metaTemplates] = await Promise.all([
      Template.find({ schoolId: req.schoolId }),
      fetchMetaTemplates(req.schoolId)
    ]);

    const metaById = new Map(metaTemplates.map((template) => [template.id, template]));
    const metaByName = new Map(metaTemplates.map((template) => [`${template.name}:${template.language}`, template]));

    for (const template of templates) {
      const metaTemplate = metaById.get(template.metaTemplateId)
        || metaByName.get(`${template.name}:${template.language}`)
        || metaTemplates.find((item) => item.name === template.name);

      if (metaTemplate) {
        applyMetaTemplateStatus(template, metaTemplate);
        await template.save();
      }
    }

    const localKeys = new Set(templates.map((template) => `${template.name}:${template.language}`));
    for (const metaTemplate of metaTemplates) {
      const key = `${metaTemplate.name}:${metaTemplate.language || 'en_US'}`;
      if (localKeys.has(key)) continue;

      const parsed = parseMetaTemplateComponents(metaTemplate);
      if (!parsed.body) continue;

      const imported = await Template.create({
        schoolId: req.schoolId,
        name: normalizeTemplateName(metaTemplate.name),
        category: String(metaTemplate.category || 'marketing').toLowerCase(),
        language: metaTemplate.language || 'en_US',
        body: parsed.body,
        header: parsed.header,
        footer: parsed.footer,
        buttons: parsed.buttons,
        metaTemplateId: metaTemplate.id,
        status: normalizeMetaTemplateStatus(metaTemplate.status),
        syncedAt: new Date()
      });

      applyMetaTemplateStatus(imported, metaTemplate);
      await imported.save();
      localKeys.add(key);
    }

    const refreshed = await Template.find({ schoolId: req.schoolId }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: 'Templates synced with Meta',
      data: refreshed
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.syncTemplate = async (req, res) => {
  try {
    const template = await Template.findOne({
      _id: req.params.id,
      schoolId: req.schoolId
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    const metaTemplate = await findMetaTemplate(template);
    if (!metaTemplate) {
      return res.status(404).json({
        success: false,
        message: 'Template was not found in Meta WhatsApp Manager'
      });
    }

    applyMetaTemplateStatus(template, metaTemplate);
    await template.save();

    res.status(200).json({
      success: true,
      message: 'Template synced with Meta',
      meta: metaTemplate,
      data: template
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.getTemplates = async (req, res) => {
  try {
    const templates = await Template.find({ schoolId: req.schoolId }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: templates.length,
      data: templates
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.createTemplate = async (req, res) => {
  try {
    const payload = sanitizeTemplatePayload(req.body);
    validateTemplateForMeta(payload);

    const template = await Template.create({
      schoolId: req.schoolId,
      ...payload,
      createdBy: req.user.id
    });

    res.status(201).json({
      success: true,
      data: template
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.uploadTemplateImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a media sample'
      });
    }

    const url = `/uploads/templates/${req.file.filename}`;
    const mediaType = req.file.mimetype.startsWith('image/')
      ? 'image'
      : req.file.mimetype.startsWith('video/')
        ? 'video'
        : 'document';

    res.status(200).json({
      success: true,
      data: {
        type: mediaType,
        url,
        publicUrl: getPublicAssetUrl(url),
        filename: req.file.originalname,
        mimetype: req.file.mimetype
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.updateTemplate = async (req, res) => {
  try {
    const template = await Template.findOne({
      _id: req.params.id,
      schoolId: req.schoolId
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    if (template.status === 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Approved templates cannot be edited'
      });
    }

    const allowedFields = ['name', 'category', 'language', 'body', 'header', 'footer', 'buttons', 'media', 'sampleText', 'status', 'rejectionReason', 'metaTemplateId'];
    const sanitized = sanitizeTemplatePayload({ ...template.toObject(), ...req.body });
    allowedFields.forEach((field) => {
      if (sanitized[field] !== undefined && req.body[field] !== undefined) {
        template[field] = sanitized[field];
      }
    });

    validateTemplateForMeta(template);

    if (req.body.status === 'approved') {
      template.approvedAt = new Date();
      template.rejectedAt = undefined;
    }

    if (req.body.status === 'rejected') {
      template.rejectedAt = new Date();
      template.approvedAt = undefined;
    }

    await template.save();

    res.status(200).json({
      success: true,
      data: template
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.submitTemplate = async (req, res) => {
  try {
    const template = await Template.findOne({
      _id: req.params.id,
      schoolId: req.schoolId
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    validateTemplateForMeta(template, { submitting: true });
    const metaResponse = await submitTemplateToMeta(template);

    template.status = String(metaResponse.status || '').toUpperCase() === 'APPROVED' ? 'approved' : 'pending';
    template.submittedAt = new Date();
    template.rejectionReason = undefined;
    template.metaTemplateId = metaResponse.id || template.metaTemplateId;
    if (template.status === 'approved') {
      template.approvedAt = new Date();
    }
    await template.save();

    res.status(200).json({
      success: true,
      message: 'Template submitted to Meta for approval',
      meta: metaResponse,
      data: template
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.deleteTemplate = async (req, res) => {
  try {
    const template = await Template.findOne({
      _id: req.params.id,
      schoolId: req.schoolId
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    let meta = null;
    if (template.metaTemplateId || template.status !== 'draft') {
      meta = await deleteTemplateFromMeta(template);
    }

    await template.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Template deleted successfully',
      meta
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
