const { createWhatsAppService } = require('../services/whatsappService');
const Lead = require('../models/Lead');
const School = require('../models/School');
const User = require('../models/User');
const ChatbotRule = require('../models/ChatbotRule');
const WhatsAppAccount = require('../models/WhatsAppAccount');
const Message = require('../models/Message');
const { encryptSecret } = require('../utils/tokenVault');
const { syncMetaAccountForSchool } = require('../services/metaAccountService');
const { leadConversationUpdate, shouldStoreRawPayloads } = require('../utils/storagePolicy');
const jwt = require('jsonwebtoken');

const getAppBaseUrl = (req) => {
  return process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
};

const getFrontendBaseUrl = () => {
  return process.env.FRONTEND_URL || 'http://127.0.0.1:5173';
};

const getMetaOAuthRedirectPath = () => {
  return process.env.META_OAUTH_REDIRECT_PATH || '/api/whatsapp/onboarding/callback';
};

const getCurrentRequestUrl = (req) => {
  return `${getAppBaseUrl(req)}${req.originalUrl.split('?')[0]}`;
};

const getMetaGraphBaseUrl = () => {
  const version = process.env.META_GRAPH_API_VERSION || 'v22.0';
  return `https://graph.facebook.com/${version}`;
};

const readFirst = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');

const verifyOnboardingSecret = (req) => {
  const state = readFirst(req.query.state, req.body.state);
  if (!state) return false;

  try {
    jwt.verify(state, process.env.JWT_SECRET);
    return true;
  } catch (error) {
    return false;
  }
};

const resolveOnboardingContext = (data) => {
  const token = readFirst(data.state, data.clientState, data.metadata?.state);

  if (token) {
    return jwt.verify(token, process.env.JWT_SECRET);
  }

  return {
    schoolId: readFirst(data.schoolId, data.metadata?.schoolId)
  };
};

const resolveSchoolIdFromCallback = (data) => {
  return resolveOnboardingContext(data).schoolId;
};

const normalizeOnboardingPayload = (data) => {
  const payload = data.payload?.payload || data.payload || {};
  const sessionInfo = data.sessionInfo || data.session_info || payload.sessionInfo || payload.session_info || {};

  return {
    provider: 'meta',
    code: readFirst(data.code, payload.code),
    accessToken: readFirst(data.accessToken, data.access_token, payload.accessToken, payload.access_token),
    appName: readFirst(data.appName, data.app, data.app_name, payload.appName, payload.app, sessionInfo.business_name),
    appId: readFirst(data.appId, data.app_id, payload.appId, process.env.META_APP_ID),
    phoneNumberId: readFirst(data.phoneNumberId, data.phone_number_id, payload.phoneNumberId, payload.phone_number_id, sessionInfo.phone_number_id),
    phoneNumber: readFirst(data.phoneNumber, data.phone, data.mobile, payload.phoneNumber, payload.phone, sessionInfo.phone_number),
    displayName: readFirst(data.displayName, data.display_name, payload.displayName, payload.display_name, sessionInfo.display_name),
    wabaId: readFirst(data.wabaId, data.waId, data.waba_id, payload.wabaId, payload.waId, payload.waba_id, sessionInfo.waba_id),
    businessId: readFirst(data.businessId, data.business_id, payload.businessId, payload.business_id, sessionInfo.business_id),
    namespace: readFirst(data.namespace, payload.namespace),
    status: readFirst(data.status, payload.status)
  };
};

const fetchMetaGraph = async (path, accessToken, params = {}) => {
  const url = new URL(`${getMetaGraphBaseUrl()}/${path.replace(/^\//, '')}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  });

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error?.message || 'Meta Graph API request failed');
  }

  return data;
};

const exchangeMetaCode = async (code, redirectUri) => {
  if (!code || !process.env.META_APP_ID || !process.env.META_APP_SECRET) return null;

  const url = new URL(`${getMetaGraphBaseUrl()}/oauth/access_token`);
  url.searchParams.set('client_id', process.env.META_APP_ID);
  url.searchParams.set('client_secret', process.env.META_APP_SECRET);
  url.searchParams.set('code', code);
  if (redirectUri) url.searchParams.set('redirect_uri', redirectUri);

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error?.message || 'Failed to exchange Meta onboarding code');
  }

  return data.access_token;
};

const inspectTokenTargets = async (accessToken) => {
  if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) return [];

  try {
    const appAccessToken = `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;
    const debug = await fetchMetaGraph('/debug_token', appAccessToken, {
      input_token: accessToken
    });

    return (debug.data?.granular_scopes || [])
      .flatMap((scope) => scope.target_ids || [])
      .filter(Boolean);
  } catch (error) {
    console.warn('Unable to inspect Meta token targets:', error.message);
    return [];
  }
};

const getPhoneForWaba = async (wabaId, accessToken) => {
  if (!wabaId) return {};

  const waba = await fetchMetaGraph(`/${wabaId}`, accessToken, {
    fields: 'id,name,account_review_status,message_template_namespace,owner_business_info,phone_numbers{id,display_phone_number,verified_name,code_verification_status}'
  });
  const phone = waba.phone_numbers?.data?.[0] || {};

  return {
    wabaId: waba.id || wabaId,
    appName: waba.name,
    displayName: phone.verified_name,
    phoneNumberId: phone.id,
    phoneNumber: phone.display_phone_number || phone.verified_name,
    namespace: waba.message_template_namespace,
    accountReviewStatus: waba.account_review_status || 'UNKNOWN',
    businessId: waba.owner_business_info?.id
  };
};

const normalizeBusinessVerificationStatus = (status) => {
  const value = String(status || '').toUpperCase();
  if (['VERIFIED', 'APPROVED', 'VERIFIED_ACCOUNT'].includes(value)) return 'verified';
  if (['REJECTED', 'DECLINED', 'FAILED'].includes(value)) return 'rejected';
  if (['PENDING', 'IN_REVIEW', 'UNDER_REVIEW', 'NOT_VERIFIED'].includes(value)) return 'pending';
  return 'unknown';
};

const fetchBusinessVerification = async (businessId, accessToken) => {
  if (!businessId) return 'unknown';

  try {
    const business = await fetchMetaGraph(`/${businessId}`, accessToken, {
      fields: 'verification_status'
    });
    return normalizeBusinessVerificationStatus(business.verification_status);
  } catch (error) {
    console.warn('Unable to fetch business verification status:', error.message);
    return 'unknown';
  }
};

const finalizeMetaAssets = async (assets, accessToken) => {
  if (!assets.businessVerificationStatus && assets.businessId) {
    assets.businessVerificationStatus = await fetchBusinessVerification(assets.businessId, accessToken);
  }
  assets.businessVerificationStatus = assets.businessVerificationStatus || 'unknown';
  assets.accountReviewStatus = assets.accountReviewStatus || 'UNKNOWN';
  return assets;
};

const discoverMetaAssets = async (accessToken, onboarding = {}) => {
  const discovered = { ...onboarding };

  if (discovered.wabaId && !discovered.phoneNumberId) {
    Object.assign(discovered, await getPhoneForWaba(discovered.wabaId, accessToken));
  }

  if (discovered.phoneNumberId && discovered.wabaId) {
    return finalizeMetaAssets(discovered, accessToken);
  }

  const targetIds = await inspectTokenTargets(accessToken);
  for (const targetId of targetIds) {
    try {
      const resolved = await getPhoneForWaba(targetId, accessToken);
      if (resolved.wabaId && resolved.phoneNumberId) {
        return finalizeMetaAssets({
          ...discovered,
          ...resolved,
          wabaId: discovered.wabaId || resolved.wabaId,
          phoneNumberId: discovered.phoneNumberId || resolved.phoneNumberId,
          phoneNumber: discovered.phoneNumber || resolved.phoneNumber,
          displayName: discovered.displayName || resolved.displayName,
          appName: discovered.appName || resolved.appName,
          namespace: discovered.namespace || resolved.namespace,
          accountReviewStatus: discovered.accountReviewStatus || resolved.accountReviewStatus,
          businessId: discovered.businessId || resolved.businessId
        }, accessToken);
      }
    } catch (error) {
      // Some token targets are business IDs rather than WABA IDs.
    }
  }

  try {
    const businesses = await fetchMetaGraph('/me/businesses', accessToken, {
      fields: 'id,name,verification_status,owned_whatsapp_business_accounts{id,name,account_review_status,message_template_namespace,phone_numbers{id,display_phone_number,verified_name}},client_whatsapp_business_accounts{id,name,account_review_status,message_template_namespace,phone_numbers{id,display_phone_number,verified_name}}'
    });

    for (const business of businesses.data || []) {
      const wabas = [
        ...(business.owned_whatsapp_business_accounts?.data || []),
        ...(business.client_whatsapp_business_accounts?.data || [])
      ];
      const waba = wabas[0];
      const phone = waba?.phone_numbers?.data?.[0];

      if (waba?.id && phone?.id) {
        return finalizeMetaAssets({
          ...discovered,
          businessId: discovered.businessId || business.id,
          appName: discovered.appName || waba.name || business.name,
          wabaId: discovered.wabaId || waba.id,
          phoneNumberId: discovered.phoneNumberId || phone.id,
          phoneNumber: discovered.phoneNumber || phone.display_phone_number || phone.verified_name,
          displayName: discovered.displayName || phone.verified_name,
          namespace: discovered.namespace || waba.message_template_namespace,
          accountReviewStatus: discovered.accountReviewStatus || waba.account_review_status || 'UNKNOWN',
          businessVerificationStatus: discovered.businessVerificationStatus || normalizeBusinessVerificationStatus(business.verification_status)
        }, accessToken);
      }
    }
  } catch (error) {
    console.warn('Unable to discover Meta WhatsApp assets:', error.message);
  }

  return finalizeMetaAssets(discovered, accessToken);
};

const subscribeWabaToApp = async (wabaId, accessToken) => {
  if (!wabaId) return;

  try {
    const response = await fetch(`${getMetaGraphBaseUrl()}/${wabaId}/subscribed_apps`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    const data = await response.json();
    if (!response.ok || data.error) {
      console.warn('Unable to subscribe WABA webhook:', data.error?.message || 'Meta subscription failed');
    }
  } catch (error) {
    console.warn('Unable to subscribe WABA webhook:', error.message);
  }
};

const assertMetaPhoneAvailableForSchool = async (schoolId, phoneNumberId) => {
  if (!phoneNumberId) return;

  const account = await WhatsAppAccount.findOne({
    phoneNumberId,
    schoolId: { $ne: schoolId },
    status: 'connected'
  }).populate('schoolId', 'name');

  if (account) {
    throw new Error(`This WhatsApp number is already connected to ${account.schoolId?.name || 'another workspace'}. Disconnect it there before connecting here.`);
  }

  const school = await School.findOne({
    _id: { $ne: schoolId },
    'whatsapp.phoneNumberId': phoneNumberId,
    'whatsapp.isConnected': true
  }).select('name');

  if (school) {
    throw new Error(`This WhatsApp number is already connected to ${school.name || 'another workspace'}. Disconnect it there before connecting here.`);
  }
};

const assertOnboardingUserOwnsSchool = async ({ schoolId, userId }) => {
  if (!userId) return;

  const user = await User.findById(userId).select('role schoolId isActive');
  if (!user || !user.isActive) {
    throw new Error('The Meta setup session user is no longer active');
  }

  const userSchoolId = user.schoolId?._id || user.schoolId;
  if (user.role !== 'super_admin' && String(userSchoolId) !== String(schoolId)) {
    throw new Error('This Meta setup session belongs to a different workspace');
  }
};

const publicWhatsappAccount = (account, school) => ({
  provider: account?.provider || school?.whatsapp?.provider || 'meta',
  appName: account?.appName || school?.whatsapp?.appName || '',
  appId: account?.appId || school?.whatsapp?.appId || '',
  phoneNumberId: account?.phoneNumberId || school?.whatsapp?.phoneNumberId || '',
  phoneNumber: account?.phoneNumber || school?.whatsapp?.phoneNumber || '',
  displayName: account?.displayName || school?.whatsapp?.displayName || '',
  wabaId: account?.wabaId || school?.whatsapp?.wabaId || '',
  businessId: account?.businessId || school?.whatsapp?.businessId || '',
  businessVerificationStatus: account?.businessVerificationStatus || school?.whatsapp?.businessVerificationStatus || 'unknown',
  accountReviewStatus: account?.accountReviewStatus || school?.whatsapp?.accountReviewStatus || 'UNKNOWN',
  namespace: account?.namespace || school?.whatsapp?.namespace || '',
  isConnected: account?.status === 'connected' || Boolean(school?.whatsapp?.isConnected),
  onboardingStatus: account?.status || school?.whatsapp?.onboardingStatus || 'not_started'
});

const createStarterAutomation = async (schoolId) => {
  const exists = await ChatbotRule.exists({ schoolId });
  if (exists) return;

  await ChatbotRule.create([
    {
      schoolId,
      keyword: 'hi',
      title: 'Welcome menu',
      response: 'Welcome to our school.\nReply 1 for admission, 2 for fees, or 3 for a callback.',
      quickReplies: [
        { label: 'Admission', value: 'admission' },
        { label: 'Fees', value: 'fees' },
        { label: 'Callback', value: 'counselor' }
      ],
      matchType: 'contains',
      priority: 100
    },
    {
      schoolId,
      keyword: 'admission',
      title: 'Admission reply',
      response: 'Admissions are open. Our counselor will contact you shortly.',
      matchType: 'contains',
      priority: 90
    },
    {
      schoolId,
      keyword: '__fallback__',
      title: 'Fallback reply',
      response: 'Thanks for messaging us. Please reply 1 for admission, 2 for fees, or 3 for callback.',
      fallbackMessage: 'Thanks for messaging us. Please reply 1 for admission, 2 for fees, or 3 for callback.',
      isFallback: true,
      priority: 0
    }
  ]);
};

// @desc    Start Meta embedded WhatsApp onboarding
// @route   POST /api/whatsapp/onboarding/start
// @access  Private
exports.startOnboarding = async (req, res) => {
  try {
    if (!process.env.META_APP_ID || !process.env.META_CONFIG_ID) {
      return res.status(500).json({
        success: false,
        message: 'Meta WhatsApp setup is not configured'
      });
    }

    const school = await School.findById(req.schoolId);

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    const state = jwt.sign(
      { schoolId: req.schoolId.toString(), userId: req.user.id },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );
    const callbackUrl = `${getAppBaseUrl(req)}${getMetaOAuthRedirectPath()}`;

    school.whatsapp.provider = 'meta';
    school.whatsapp.onboardingStatus = 'pending';
    school.whatsapp.lastOnboardingEventAt = new Date();
    await school.save();

    await WhatsAppAccount.findOneAndUpdate(
      { schoolId: req.schoolId },
      {
        provider: 'meta',
        status: 'pending',
        lastOnboardingEventAt: new Date()
      },
      { upsert: true, new: true }
    );

    res.status(200).json({
      success: true,
      data: {
        provider: 'meta',
        appId: process.env.META_APP_ID,
        configId: process.env.META_CONFIG_ID,
        graphApiVersion: process.env.META_GRAPH_API_VERSION || 'v22.0',
        state,
        callbackUrl
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Connect WhatsApp using server-side .env credentials
// @route   POST /api/whatsapp/connect-configured
// @access  Private
exports.connectConfiguredAccount = async (req, res) => {
  try {
    if (req.user.role !== 'super_admin' && process.env.ALLOW_CONFIGURED_META_CONNECT !== 'true') {
      return res.status(403).json({
        success: false,
        message: 'Use Meta Embedded Signup to connect your own WhatsApp Business account for this workspace.'
      });
    }

    const required = ['META_SYSTEM_USER_ACCESS_TOKEN', 'META_PHONE_NUMBER_ID', 'META_WABA_ID'];
    const missing = required.filter((key) => !process.env[key]);

    if (missing.length) {
      return res.status(400).json({
        success: false,
        message: `Missing WhatsApp server config: ${missing.join(', ')}`
      });
    }

    if (!req.schoolId) {
      return res.status(400).json({
        success: false,
        message: 'School is required before connecting WhatsApp'
      });
    }

    const school = await School.findById(req.schoolId);

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    await assertMetaPhoneAvailableForSchool(req.schoolId, process.env.META_PHONE_NUMBER_ID);

    const accountUpdate = {
      provider: 'meta',
      connectedBy: req.user.id,
      appName: process.env.META_APP_NAME || 'Meta WhatsApp',
      appId: process.env.META_APP_ID,
      phoneNumberId: process.env.META_PHONE_NUMBER_ID,
      phoneNumber: process.env.META_PHONE_NUMBER || school.whatsapp.phoneNumber || '',
      displayName: process.env.META_DISPLAY_NAME || school.name,
      wabaId: process.env.META_WABA_ID,
      businessId: process.env.META_BUSINESS_ID || school.whatsapp.businessId,
      businessVerificationStatus: 'pending',
      accountReviewStatus: 'PENDING',
      status: 'connected',
      connectedAt: new Date(),
      lastOnboardingEventAt: new Date(),
      accessToken: encryptSecret(process.env.META_SYSTEM_USER_ACCESS_TOKEN)
    };
    if (shouldStoreRawPayloads()) {
      accountUpdate.rawMetadata = {
        source: 'server-config',
        graphApiVersion: process.env.META_GRAPH_API_VERSION
      };
    }

    school.whatsapp.provider = 'meta';
    school.whatsapp.appName = accountUpdate.appName;
    school.whatsapp.appId = accountUpdate.appId;
    school.whatsapp.phoneNumberId = accountUpdate.phoneNumberId;
    school.whatsapp.phoneNumber = accountUpdate.phoneNumber;
    school.whatsapp.displayName = accountUpdate.displayName;
    school.whatsapp.wabaId = accountUpdate.wabaId;
    school.whatsapp.businessId = accountUpdate.businessId;
    school.whatsapp.businessVerificationStatus = accountUpdate.businessVerificationStatus;
    school.whatsapp.accountReviewStatus = accountUpdate.accountReviewStatus;
    school.whatsapp.onboardingStatus = 'connected';
    school.whatsapp.isConnected = true;
    school.whatsapp.lastOnboardingEventAt = new Date();
    await school.save();

    const account = await WhatsAppAccount.findOneAndUpdate(
      { schoolId: req.schoolId },
      accountUpdate,
      { upsert: true, new: true }
    );

    await subscribeWabaToApp(accountUpdate.wabaId, process.env.META_SYSTEM_USER_ACCESS_TOKEN);
    await createStarterAutomation(school._id);

    res.status(200).json({
      success: true,
      message: 'WhatsApp connected from server configuration',
      data: publicWhatsappAccount(account, school)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Receive Meta onboarding callback and save WhatsApp credentials
// @route   GET/POST /api/whatsapp/onboarding/callback
// @access  Public callback
exports.handleOnboardingCallback = async (req, res) => {
  try {
    if (!verifyOnboardingSecret(req)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid onboarding callback secret'
      });
    }

    const data = {
      ...req.query,
      ...(req.body || {})
    };
    const onboardingContext = resolveOnboardingContext(data);
    const schoolId = onboardingContext.schoolId;

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: 'Missing onboarding state or schoolId'
      });
    }

    await assertOnboardingUserOwnsSchool(onboardingContext);

    const onboarding = normalizeOnboardingPayload(data);
    const school = await School.findById(schoolId);

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    const exchangedToken = onboarding.accessToken || await exchangeMetaCode(
      onboarding.code,
      data.redirectUri || data.redirect_uri || getCurrentRequestUrl(req)
    );

    if (!exchangedToken) {
      return res.status(400).json({
        success: false,
        message: 'Meta Embedded Signup did not return an authorization code'
      });
    }

    const metaAccount = await discoverMetaAssets(exchangedToken, onboarding);
    if (!metaAccount.phoneNumberId || !metaAccount.wabaId) {
      return res.status(400).json({
        success: false,
        message: 'Meta connected, but no WhatsApp Business number was found. Please finish number selection in Embedded Signup.'
      });
    }

    await assertMetaPhoneAvailableForSchool(schoolId, metaAccount.phoneNumberId);

    const encryptedAccessToken = exchangedToken
      ? encryptSecret(exchangedToken)
      : undefined;

    school.whatsapp.provider = 'meta';
    school.whatsapp.appName = metaAccount.appName || school.whatsapp.appName;
    school.whatsapp.appId = metaAccount.appId || school.whatsapp.appId;
    school.whatsapp.phoneNumberId = metaAccount.phoneNumberId;
    school.whatsapp.phoneNumber = metaAccount.phoneNumber || school.whatsapp.phoneNumber;
    school.whatsapp.displayName = metaAccount.displayName || school.name;
    school.whatsapp.wabaId = metaAccount.wabaId;
    school.whatsapp.businessId = metaAccount.businessId || school.whatsapp.businessId;
    school.whatsapp.businessVerificationStatus = metaAccount.businessVerificationStatus || 'pending';
    school.whatsapp.accountReviewStatus = metaAccount.accountReviewStatus || 'UNKNOWN';
    school.whatsapp.namespace = metaAccount.namespace || school.whatsapp.namespace;
    school.whatsapp.onboardingStatus = onboarding.status === 'failed' ? 'failed' : 'connected';
    school.whatsapp.isConnected = Boolean(encryptedAccessToken && school.whatsapp.phoneNumberId && school.whatsapp.wabaId);
    school.whatsapp.lastOnboardingEventAt = new Date();

    await school.save();
    await subscribeWabaToApp(school.whatsapp.wabaId, exchangedToken);

    const accountUpdate = {
      provider: 'meta',
      connectedBy: onboardingContext.userId,
      appName: school.whatsapp.appName,
      appId: school.whatsapp.appId,
      phoneNumberId: school.whatsapp.phoneNumberId,
      phoneNumber: school.whatsapp.phoneNumber,
      displayName: school.whatsapp.displayName,
      wabaId: school.whatsapp.wabaId,
      businessId: school.whatsapp.businessId,
      businessVerificationStatus: school.whatsapp.businessVerificationStatus,
      accountReviewStatus: school.whatsapp.accountReviewStatus,
      namespace: school.whatsapp.namespace,
      status: school.whatsapp.onboardingStatus,
      lastOnboardingEventAt: new Date()
    };
    if (shouldStoreRawPayloads()) accountUpdate.rawMetadata = data;

    if (encryptedAccessToken) accountUpdate.accessToken = encryptedAccessToken;
    if (school.whatsapp.isConnected) accountUpdate.connectedAt = new Date();

    const account = await WhatsAppAccount.findOneAndUpdate(
      { schoolId },
      accountUpdate,
      { upsert: true, new: true }
    );

    if (school.whatsapp.isConnected) {
      await createStarterAutomation(school._id);
    }

    if (req.method === 'GET') {
      const status = school.whatsapp.isConnected ? 'connected' : 'pending';
      return res.redirect(`${getFrontendBaseUrl()}/whatsapp-setup?whatsapp=${status}`);
    }

    res.status(200).json({
      success: true,
      message: 'WhatsApp onboarding saved',
      data: publicWhatsappAccount(account, school)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Send WhatsApp message
// @route   POST /api/whatsapp/send
// @access  Private
exports.sendMessage = async (req, res) => {
  try {
    const { phone, message, leadId } = req.body;

    if (!phone || !message) {
      return res.status(400).json({
        success: false,
        message: 'Please provide phone and message'
      });
    }

    // Check message limits
    const school = await School.findById(req.schoolId);
    await school.resetDailyLimits();

    if (school.limits.messagesUsedToday >= school.limits.maxMessagesPerDay) {
      return res.status(403).json({
        success: false,
        message: 'Daily message limit reached'
      });
    }

    const whatsappService = createWhatsAppService(req.schoolId);
    const result = await whatsappService.sendMessage(phone, message);

    if (result.success) {
      // Update lead conversation if leadId provided
      if (leadId) {
        await Lead.findOneAndUpdate({ _id: leadId, schoolId: req.schoolId }, leadConversationUpdate({
          from: 'school',
          message,
          timestamp: new Date(),
          messageId: result.messageId,
          status: 'sent'
        }));
      }

      await Message.create({
        schoolId: req.schoolId,
        leadId,
        phoneNumberId: school.whatsapp.phoneNumberId,
        wabaId: school.whatsapp.wabaId,
        userNumber: phone,
        direction: 'outbound',
        message,
        messageType: 'text',
        metaMessageId: result.messageId,
        status: 'sent',
        sentAt: new Date()
      });

      // Update school analytics
      await School.findByIdAndUpdate(req.schoolId, {
        $inc: {
          'analytics.totalMessagesSent': 1,
          'limits.messagesUsedToday': 1
        }
      });

      res.status(200).json({
        success: true,
        messageId: result.messageId,
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Send template message
// @route   POST /api/whatsapp/send-template
// @access  Private
exports.sendTemplateMessage = async (req, res) => {
  try {
    const { phone, templateId, variables, leadId } = req.body;

    if (!phone || !templateId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide phone and templateId'
      });
    }

    const whatsappService = createWhatsAppService(req.schoolId);
    const result = await whatsappService.sendTemplateMessage(phone, templateId, variables);

    if (result.success) {
      // Update lead if leadId provided
      if (leadId) {
        await Lead.findOneAndUpdate({ _id: leadId, schoolId: req.schoolId }, leadConversationUpdate({
          from: 'school',
          message: `Template: ${templateId}`,
          timestamp: new Date(),
          messageId: result.messageId,
          status: 'sent'
        }));
      }

      const school = await School.findById(req.schoolId);
      await Message.create({
        schoolId: req.schoolId,
        leadId,
        phoneNumberId: school?.whatsapp?.phoneNumberId,
        wabaId: school?.whatsapp?.wabaId,
        userNumber: phone,
        direction: 'outbound',
        message: `Template: ${templateId}`,
        messageType: 'template',
        metaMessageId: result.messageId,
        status: 'sent',
        sentAt: new Date()
      });

      // Update analytics
      await School.findByIdAndUpdate(req.schoolId, {
        $inc: {
          'analytics.totalMessagesSent': 1,
          'limits.messagesUsedToday': 1
        }
      });

      res.status(200).json({
        success: true,
        messageId: result.messageId,
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get message status
// @route   GET /api/whatsapp/status/:messageId
// @access  Private
exports.getMessageStatus = async (req, res) => {
  try {
    const whatsappService = createWhatsAppService(req.schoolId);
    const status = await whatsappService.getMessageStatus(req.params.messageId);

    res.status(200).json({
      success: true,
      data: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get WhatsApp config status
// @route   GET /api/whatsapp/config
// @access  Private
exports.getConfig = async (req, res) => {
  try {
    const data = await syncMetaAccountForSchool(req.schoolId);

    res.set('Cache-Control', 'no-store');
    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
