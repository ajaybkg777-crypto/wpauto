const WhatsAppFlow = require('../models/WhatsAppFlow');
const WhatsAppFlowSubmission = require('../models/WhatsAppFlowSubmission');
const WhatsAppAccount = require('../models/WhatsAppAccount');
const School = require('../models/School');
const { decryptSecret } = require('../utils/tokenVault');
const { createWhatsAppService } = require('../services/whatsappService');

const workingFlowTokenCache = new Map();

const getMetaGraphBaseUrl = () => {
  const version = process.env.META_GRAPH_API_VERSION || 'v25.0';
  return `https://graph.facebook.com/${version}`;
};

const normalizeName = (name = '') => String(name)
  .trim()
  .replace(/\s+/g, '_')
  .replace(/[^a-zA-Z0-9_]/g, '_')
  .slice(0, 512);

const getFlowMetaConfig = async (schoolId) => {
  const [school, account] = await Promise.all([
    School.findById(schoolId),
    WhatsAppAccount.findOne({ schoolId }).select('+accessToken')
  ]);

  const wabaId = account?.wabaId || school?.whatsapp?.wabaId || process.env.META_WABA_ID;
  const accountAccessToken = decryptSecret(account?.accessToken);
  const envAccessToken = decryptSecret(process.env.META_SYSTEM_USER_ACCESS_TOKEN);
  const accessTokenCandidates = [accountAccessToken, envAccessToken].filter((token, index, tokens) => {
    return token && tokens.indexOf(token) === index;
  });
  const accessToken = accessTokenCandidates[0];

  if (!wabaId) throw new Error('WhatsApp Business Account ID is missing');
  if (!accessToken) throw new Error('Meta access token is missing');

  return { wabaId, accessToken, accessTokenCandidates };
};

const buildComponent = (field) => {
  const name = field.name || normalizeName(field.label).toLowerCase();
  const base = {
    name,
    label: field.label,
    required: Boolean(field.required)
  };

  if (field.type === 'textarea') {
    return { type: 'TextArea', ...base };
  }

  if (field.type === 'single_select' || field.type === 'multi_select' || field.type === 'rating') {
    const options = (field.options || [])
      .filter(Boolean)
      .map((option, index) => ({
        id: normalizeName(option).toLowerCase() || `option_${index + 1}`,
        title: option
      }));

    return {
      type: field.type === 'multi_select' ? 'CheckboxGroup' : 'RadioButtonsGroup',
      ...base,
      'data-source': options
    };
  }

  return {
    type: 'TextInput',
    ...base,
    'input-type': field.type === 'email'
      ? 'email'
      : field.type === 'phone'
        ? 'phone'
        : field.type === 'number'
          ? 'number'
          : field.type === 'date'
            ? 'date'
            : 'text'
  };
};

const buildFlowJson = (flow) => {
  const children = [];

  if (flow.description) {
    children.push({
      type: 'TextBody',
      text: flow.description
    });
  }

  for (const field of flow.fields || []) {
    children.push(buildComponent(field));
  }

  children.push({
    type: 'Footer',
    label: flow.submitLabel || 'Submit',
    'on-click-action': {
      name: 'complete',
      payload: (flow.fields || []).reduce((payload, field) => ({
        ...payload,
        [field.name]: `\${form.${field.name}}`
      }), {})
    }
  });

  return {
    version: '6.3',
    screens: [{
      id: 'FORM',
      title: flow.title || flow.name,
      terminal: true,
      success: true,
      data: {},
      layout: {
        type: 'SingleColumnLayout',
        children
      }
    }]
  };
};

const fetchMetaWithTokenFallback = async (wabaId, config, requestFactory) => {
  const cachedToken = workingFlowTokenCache.get(wabaId);
  const tokenCandidates = config.accessTokenCandidates?.length
    ? config.accessTokenCandidates
    : [config.accessToken].filter(Boolean);
  const tokens = cachedToken
    ? [cachedToken, ...tokenCandidates.filter((token) => token !== cachedToken)]
    : tokenCandidates;
  let lastError = null;

  for (const token of tokens) {
    const response = await requestFactory(token);
    const data = await response.json();

    if (!response.ok || data.error) {
      const errorMessage = data.error?.message || 'Meta flow request failed';
      const isAuthError = response.status === 401
        || data.error?.code === 190
        || /auth|token|session|permission/i.test(errorMessage);
      lastError = new Error(errorMessage);
      lastError.meta = data.error || data;

      if (isAuthError && tokens.length > 1) {
        continue;
      }

      throw lastError;
    }

    workingFlowTokenCache.set(wabaId, token);
    return data;
  }

  throw lastError || new Error('Meta flow request failed');
};

const findExistingMetaFlow = async (wabaId, config, name) => {
  const url = new URL(`${getMetaGraphBaseUrl()}/${wabaId}/flows`);
  url.searchParams.set('fields', 'id,name,status,categories,validation_errors');
  url.searchParams.set('limit', '100');

  const data = await fetchMetaWithTokenFallback(wabaId, config, (token) => fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  }));

  return (data.data || []).find((flow) => flow.name === name);
};

const submitFlowToMeta = async (flow, publish = false) => {
  const config = await getFlowMetaConfig(flow.schoolId);
  const { wabaId } = config;
  const flowJson = flow.flowJson || JSON.stringify(buildFlowJson(flow));
  const name = normalizeName(flow.name);
  const existingFlow = await findExistingMetaFlow(wabaId, config, name);

  if (existingFlow) {
    return {
      id: existingFlow.id,
      status: existingFlow.status,
      validation_errors: existingFlow.validation_errors || [],
      already_exists: true
    };
  }

  const payload = {
    name,
    categories: [flow.category || 'LEAD_GENERATION'],
    flow_json: flowJson,
    publish
  };

  if (flow.mode === 'with_endpoint' && flow.endpointUri) {
    payload.endpoint_uri = flow.endpointUri;
  }

  return fetchMetaWithTokenFallback(wabaId, config, (token) => fetch(`${getMetaGraphBaseUrl()}/${wabaId}/flows`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }));
};

exports.getFlows = async (req, res) => {
  const flows = await WhatsAppFlow.find({ schoolId: req.schoolId }).sort({ createdAt: -1 });
  res.status(200).json({ success: true, count: flows.length, data: flows });
};

exports.getFlowSubmissions = async (req, res) => {
  const query = { schoolId: req.schoolId };
  if (req.params.id) query.flowId = req.params.id;

  const submissions = await WhatsAppFlowSubmission.find(query)
    .sort({ submittedAt: -1 })
    .limit(100);

  res.status(200).json({
    success: true,
    count: submissions.length,
    data: submissions
  });
};

exports.createFlow = async (req, res) => {
  const normalizedName = normalizeName(req.body.name);
  const existingFlow = await WhatsAppFlow.findOne({
    schoolId: req.schoolId,
    name: normalizedName
  });

  if (existingFlow) {
    return res.status(200).json({
      success: true,
      message: 'Flow already exists. Loaded existing draft.',
      data: existingFlow
    });
  }

  const flow = await WhatsAppFlow.create({
    schoolId: req.schoolId,
    ...req.body,
    name: normalizedName,
    fields: req.body.fields || [],
    createdBy: req.user.id
  });

  flow.flowJson = JSON.stringify(buildFlowJson(flow));
  await flow.save();

  res.status(201).json({ success: true, data: flow });
};

exports.updateFlow = async (req, res) => {
  const flow = await WhatsAppFlow.findOne({ _id: req.params.id, schoolId: req.schoolId });
  if (!flow) {
    return res.status(404).json({ success: false, message: 'Flow not found' });
  }

  if (flow.status === 'published') {
    return res.status(400).json({ success: false, message: 'Published flows cannot be edited. Duplicate it and create a new version.' });
  }

  const allowed = ['name', 'category', 'mode', 'title', 'description', 'submitLabel', 'endpointUri', 'fields'];
  allowed.forEach((field) => {
    if (req.body[field] !== undefined) flow[field] = req.body[field];
  });
  flow.name = normalizeName(flow.name);
  flow.flowJson = JSON.stringify(buildFlowJson(flow));
  await flow.save();

  res.status(200).json({ success: true, data: flow });
};

exports.previewFlow = async (req, res) => {
  const flow = { ...req.body, name: normalizeName(req.body.name), fields: req.body.fields || [] };
  res.status(200).json({ success: true, data: buildFlowJson(flow) });
};

exports.submitFlow = async (req, res) => {
  const flow = await WhatsAppFlow.findOne({ _id: req.params.id, schoolId: req.schoolId });
  if (!flow) {
    return res.status(404).json({ success: false, message: 'Flow not found' });
  }

  flow.flowJson = JSON.stringify(buildFlowJson(flow));
  const meta = await submitFlowToMeta(flow, Boolean(req.body.publish));
  flow.metaFlowId = meta.id || flow.metaFlowId;
  flow.status = req.body.publish ? 'published' : 'submitted';
  flow.validationErrors = (meta.validation_errors || []).map((error) => ({
    message: error.message || error.error,
    errorType: error.error_type,
    lineStart: error.line_start,
    lineEnd: error.line_end
  }));
  flow.submittedAt = new Date();
  if (req.body.publish) flow.publishedAt = new Date();
  await flow.save();

  res.status(200).json({ success: true, meta, data: flow });
};

exports.sendFlowMessage = async (req, res) => {
  const { phone, cta, header, body, footer } = req.body;
  if (!phone) {
    return res.status(400).json({ success: false, message: 'Phone number is required' });
  }

  const flow = await WhatsAppFlow.findOne({ _id: req.params.id, schoolId: req.schoolId });
  if (!flow) {
    return res.status(404).json({ success: false, message: 'Flow not found' });
  }

  if (!flow.metaFlowId) {
    return res.status(400).json({ success: false, message: 'Submit this flow to Meta before sending Apply Now' });
  }

  const result = await createWhatsAppService(req.schoolId).sendFlowMessage(phone, flow, {
    cta,
    header,
    body,
    footer
  });

  if (!result.success) {
    const message = /131030|allowed list/i.test(result.error || '')
      ? 'Meta test mode: add this recipient phone number to the allowed list in Meta WhatsApp Manager, then try again.'
      : result.error || 'Could not send WhatsApp Flow';
    return res.status(400).json({ success: false, message });
  }

  res.status(200).json({
    success: true,
    message: 'WhatsApp Flow sent',
    data: {
      messageId: result.messageId,
      flowId: flow._id,
      metaFlowId: flow.metaFlowId
    }
  });
};

exports.deleteFlow = async (req, res) => {
  const flow = await WhatsAppFlow.findOne({ _id: req.params.id, schoolId: req.schoolId });
  if (!flow) {
    return res.status(404).json({ success: false, message: 'Flow not found' });
  }

  await flow.deleteOne();
  res.status(200).json({ success: true, message: 'Flow deleted' });
};
