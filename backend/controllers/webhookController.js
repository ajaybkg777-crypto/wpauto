const crypto = require('crypto');
const Lead = require('../models/Lead');
const School = require('../models/School');
const ChatbotRule = require('../models/ChatbotRule');
const Broadcast = require('../models/Broadcast');
const WhatsAppAccount = require('../models/WhatsAppAccount');
const Message = require('../models/Message');
const WhatsAppFlow = require('../models/WhatsAppFlow');
const WhatsAppFlowSubmission = require('../models/WhatsAppFlowSubmission');
const { createWhatsAppService } = require('../services/whatsappService');
const { compactMessageRecord, leadConversationUpdate, shouldStoreRawPayloads } = require('../utils/storagePolicy');

const formatOptions = (options = []) => {
  if (!options.length) return '';
  return options.map((option, index) => `${index + 1}. ${option.label}`).join('\n');
};

const buildStepMessage = (step) => {
  const options = formatOptions(step?.options || []);
  return options ? `${step.question}\n\n${options}` : step?.question;
};

const normalizeMessage = (message = '') => String(message).trim().toLowerCase();
const webhookDebugEnabled = () => process.env.WEBHOOK_DEBUG !== 'false';
const isOptOutMessage = (message = '') => {
  const value = normalizeMessage(message)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return [
    'stop',
    'unsubscribe',
    'unsub',
    'opt out',
    'optout',
    'do not send',
    'dont send',
    'don t send',
    'no message',
    'no messages',
    'band',
    'band karo',
    'message band',
    'msg band',
    'nahi bhejo',
    'mat bhejo'
  ].includes(value);
};
const isOptInMessage = (message = '') => {
  const value = normalizeMessage(message)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return ['start', 'subscribe', 'yes', 'resume', 'continue'].includes(value);
};

const webhookLog = (...args) => {
  if (webhookDebugEnabled()) {
    console.log('[WEBHOOK]', ...args);
  }
};

const readFirst = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');

const parseJsonSafely = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
};

const normalizeIncomingPayload = (payload = {}) => {
  const nestedMessage = payload.message || payload.messages?.[0] || {};
  const sender = payload.sender || payload.contacts?.[0] || {};
  const nfmReply = nestedMessage.interactive?.nfm_reply || payload.interactive?.nfm_reply;
  const flowAnswers = parseJsonSafely(nfmReply?.response_json);
  const textBody = typeof nestedMessage.text === 'object'
    ? nestedMessage.text.body
    : nestedMessage.text;
  const payloadText = typeof payload.text === 'object'
    ? payload.text.body
    : payload.text;

  return {
    phone: readFirst(payload.phone, payload.mobile, payload.from, nestedMessage.from, sender.wa_id),
    message: readFirst(
      textBody,
      typeof payload.message === 'string' ? payload.message : payload.message?.text,
      payloadText,
      textBody,
      nestedMessage.button?.text,
      nestedMessage.interactive?.button_reply?.title,
      nestedMessage.interactive?.button_reply?.id,
      nestedMessage.interactive?.list_reply?.title,
      nestedMessage.interactive?.list_reply?.id,
      nfmReply?.body,
      nfmReply?.name,
      payload.button?.text,
      payload.interactive?.button_reply?.title,
      payload.interactive?.button_reply?.id,
      payload.interactive?.list_reply?.title,
      payload.interactive?.list_reply?.id,
      flowAnswers ? 'WhatsApp Flow submitted' : undefined
    ),
    flowToken: readFirst(nfmReply?.flow_token, payload.flowToken, payload.flow_token),
    flowResponse: flowAnswers,
    name: readFirst(payload.name, sender.profile?.name, sender.name),
    appName: readFirst(payload.appName, payload.app, payload.app_name),
    phoneNumberId: readFirst(payload.phoneNumberId, payload.phone_number_id, payload.metadata?.phone_number_id),
    wabaId: readFirst(payload.wabaId, payload.waId, payload.metadata?.waba_id),
    metaMessageId: readFirst(payload.id, payload.messageId, nestedMessage.id),
    messageType: readFirst(payload.type, nestedMessage.type, nfmReply ? 'flow_submission' : 'text')
  };
};

const findSchoolForPayload = async (payload = {}) => {
  const normalized = normalizeIncomingPayload(payload);
  const accountQuery = [];

  if (normalized.appName) accountQuery.push({ appName: normalized.appName });
  if (normalized.phoneNumberId) accountQuery.push({ phoneNumberId: normalized.phoneNumberId });
  if (normalized.wabaId) accountQuery.push({ wabaId: normalized.wabaId });

  if (accountQuery.length) {
    const accounts = await WhatsAppAccount.find({ $or: accountQuery })
      .sort({ connectedAt: -1, updatedAt: -1 })
      .limit(10);

    let bestMatch = null;
    for (const account of accounts) {
      const school = await School.findById(account.schoolId);
      if (!school) continue;

      const score = [
        account.status === 'connected' ? 1000 : 0,
        school.whatsapp?.isConnected ? 500 : 0,
        normalized.phoneNumberId && account.phoneNumberId === normalized.phoneNumberId ? 100 : 0,
        normalized.wabaId && account.wabaId === normalized.wabaId ? 75 : 0,
        normalized.appName && account.appName === normalized.appName ? 50 : 0,
        new Date(account.connectedAt || account.updatedAt || 0).getTime() / 1000000000000
      ].reduce((total, value) => total + value, 0);

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { account, school, score };
      }
    }

    if (bestMatch) {
      webhookLog('account selected', {
        accountId: bestMatch.account._id.toString(),
        schoolId: bestMatch.school._id.toString(),
        status: bestMatch.account.status,
        phoneNumberId: bestMatch.account.phoneNumberId
      });
      return { school: bestMatch.school, normalized };
    }
  }

  if (normalized.appName) {
    const school = await School.findOne({ 'whatsapp.appName': normalized.appName });
    return { school, normalized };
  }

  const envPhoneNumberMatches = normalized.phoneNumberId
    && process.env.META_PHONE_NUMBER_ID
    && normalized.phoneNumberId === process.env.META_PHONE_NUMBER_ID;
  const envWabaMatches = normalized.wabaId
    && process.env.META_WABA_ID
    && normalized.wabaId === process.env.META_WABA_ID;

  if (envPhoneNumberMatches || envWabaMatches) {
    const school = await School.findOne({
      $or: [
        { 'whatsapp.phoneNumberId': process.env.META_PHONE_NUMBER_ID },
        { 'whatsapp.wabaId': process.env.META_WABA_ID },
        { name: process.env.ADMIN_SCHOOL_NAME || 'Bkgis' }
      ]
    }).sort({ updatedAt: -1 });

    if (school) {
      webhookLog('env meta account selected', {
        schoolId: school._id.toString(),
        phoneNumberId: normalized.phoneNumberId,
        wabaId: normalized.wabaId
      });
      return { school, normalized };
    }
  }

  return { school: null, normalized };
};

const joinUrl = (base = '', path = '') => {
  if (!base) return '';
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
};

const buildTemplateValues = (school, lead) => {
  const website = school?.website || process.env.FRONTEND_URL || '';
  const admissionLink = process.env.ADMISSION_LINK || process.env.FEES_LINK || process.env.WEBSITE_LINK || joinUrl(website, 'admission');
  const jobLink = process.env.JOB_LINK || process.env.CAREERS_LINK || joinUrl(website, 'careers');
  const contact = process.env.COUNSELOR_CONTACT || process.env.BUSINESS_CONTACT || process.env.HR_CONTACT || school?.phone || school?.whatsapp?.phoneNumber || '';

  return {
    '{{1}}': lead?.name || 'there',
    '{{2}}': admissionLink || 'Please contact us for admission details.',
    '{{3}}': jobLink || 'Please contact us for the job application link.',
    '{{4}}': contact || 'our office number'
  };
};

const personalizeMessage = (message, school, lead) => {
  if (!message) return message;
  const values = buildTemplateValues(school, lead);

  return Object.entries(values).reduce((text, [token, value]) => {
    return text.split(token).join(value);
  }, message);
};

const splitConfiguredUrls = (value = '') => String(value || '')
  .split(',')
  .map((url) => url.trim())
  .filter((url) => /^https?:\/\//i.test(url));

const buildAdmissionInfoText = (school) => [
  school?.admissionAutomation?.processText || process.env.ADMISSION_PROCESS_TEXT || [
    'Admission Process',
    '1. Submit the admission form',
    '2. Counselor verification call',
    '3. Campus visit or online counseling',
    '4. Document submission',
    '5. Fee payment and admission confirmation'
  ].join('\n'),
  school?.admissionAutomation?.documentsText || process.env.ADMISSION_DOCUMENTS_TEXT || [
    'Required Documents',
    '- Student Aadhaar/Birth certificate',
    '- Previous class marksheet',
    '- Transfer certificate, if applicable',
    '- Passport size photos',
    '- Parent/guardian ID proof'
  ].join('\n'),
  school?.admissionAutomation?.feeStructureText || process.env.ADMISSION_FEE_STRUCTURE_TEXT || [
    'Fee Structure',
    `For latest fee details, our ${school?.name || 'school'} counselor will share the class-wise structure.`
  ].join('\n')
].join('\n\n');

const sendAdmissionInfoPack = async (schoolId, lead) => {
  const school = await School.findById(schoolId);
  const whatsappService = createWhatsAppService(schoolId);
  const results = [];

  results.push(await whatsappService.sendMessage(lead.phone, buildAdmissionInfoText(school)));

  const brochureUrl = school?.admissionAutomation?.brochurePdfUrl || process.env.ADMISSION_BROCHURE_PDF_URL;
  if (/^https?:\/\//i.test(brochureUrl || '')) {
    results.push(await whatsappService.sendDocumentMessage(
      lead.phone,
      brochureUrl,
      school?.admissionAutomation?.brochureFilename || process.env.ADMISSION_BROCHURE_FILENAME || 'Admission-Brochure.pdf',
      'Admission brochure'
    ));
  }

  const photoUrls = (school?.admissionAutomation?.schoolPhotoUrls || []).length
    ? school.admissionAutomation.schoolPhotoUrls.filter((url) => /^https?:\/\//i.test(url || ''))
    : splitConfiguredUrls(process.env.ADMISSION_SCHOOL_PHOTOS_URLS);
  for (const [index, photoUrl] of photoUrls.slice(0, 3).entries()) {
    results.push(await whatsappService.sendImageMessage(
      lead.phone,
      photoUrl,
      index === 0 ? `${school?.name || 'School'} photos` : ''
    ));
  }

  const campusVideoUrl = school?.admissionAutomation?.campusVideoUrl || process.env.ADMISSION_CAMPUS_VIDEO_URL;
  if (/^https?:\/\//i.test(campusVideoUrl || '')) {
    results.push(await whatsappService.sendVideoMessage(lead.phone, campusVideoUrl, 'Campus video'));
  }

  return results;
};

const getEditDistance = (left = '', right = '') => {
  const a = String(left);
  const b = String(right);
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[a.length][b.length];
};

const isCloseMatch = (input = '', target = '') => {
  const value = normalizeMessage(input).replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const keyword = normalizeMessage(target);
  if (!value || !keyword) return false;
  if (value.includes(keyword) || keyword.includes(value)) return true;

  const words = value.split(' ').filter(Boolean);
  const maxDistance = keyword.length <= 4 ? 1 : 2;
  return words.some((word) => {
    if (Math.abs(word.length - keyword.length) > maxDistance) return false;
    return getEditDistance(word, keyword) <= maxDistance;
  });
};

const getIntentText = (message = '') => {
  const incoming = normalizeMessage(message);
  const compact = incoming.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

  const shortcuts = {
    '1': 'admission',
    '2': 'fees',
    '3': 'facilities',
    '4': 'transport',
    '5': 'student services',
    '6': 'visit',
    '7': 'career',
    '8': 'counselor'
  };

  if (shortcuts[compact]) return shortcuts[compact];
  if (['hello', 'hey', 'hii', 'menu', 'start', 'namaste'].some((word) => isCloseMatch(compact, word))) return 'hi';
  if (['admission', 'admissions', 'addmission', 'admis', 'apply', 'dakhila', 'enquiry', 'inquiry', 'interested', 'intrested'].some((word) => isCloseMatch(compact, word))) return 'admission';
  if (['fee', 'fees', 'school fee', 'school fees', 'feez', 'price', 'pricing', 'cost', 'rate', 'package', 'charges', 'paisa', 'batao'].some((word) => isCloseMatch(compact, word))) return 'fees';
  if (['facility', 'facilities', 'smart class', 'computer lab', 'science lab', 'library', 'sports', 'cctv'].some((word) => isCloseMatch(compact, word))) return 'facilities';
  if (['student service', 'student services', 'attendance', 'homework', 'timetable', 'result', 'certificate', 'leave', 'complaint'].some((word) => isCloseMatch(compact, word))) return compact;
  if (['course', 'courses', 'class', 'classes', 'program', 'programs', 'batch', 'batches'].some((word) => isCloseMatch(compact, word))) return 'admission';
  if (['job', 'jobs', 'career', 'careers', 'vacancy', 'teacher', 'hr', 'prt', 'tgt', 'pgt'].some((word) => isCloseMatch(compact, word))) return 'career';
  if (['counsellor', 'counselor', 'counselling', 'counseling', 'call', 'callback', 'call back', 'contact', 'phone', 'help', 'baat', 'talk'].some((word) => isCloseMatch(compact, word))) return 'counselor';
  if (['visit', 'school visit', 'tour', 'campus', 'book visit', 'appointment', 'meeting', 'milna'].some((word) => isCloseMatch(compact, word))) return 'visit';
  if (['hostel', 'hostal', 'boarding'].some((word) => isCloseMatch(compact, word))) return 'hostel';
  if (['transport', 'bus', 'van', 'pickup'].some((word) => isCloseMatch(compact, word))) return 'transport';

  return incoming;
};

const matchesFlowOption = (option, incoming, index) => {
  const normalizedValue = normalizeMessage(option.value || option.label);
  const normalizedLabel = normalizeMessage(option.label);
  const intentText = getIntentText(incoming);
  const optionIntent = getIntentText(`${normalizedValue} ${normalizedLabel} ${option.response || ''}`);
  const yesWords = ['yes', 'y', 'ha', 'haan', 'han', 'interested'];
  const noWords = ['no', 'n', 'nahi', 'nahin', 'not interested'];

  return normalizedValue === incoming
    || normalizedLabel === incoming
    || normalizedValue === intentText
    || normalizedLabel.includes(intentText)
    || (optionIntent && intentText === optionIntent)
    || String(index + 1) === incoming
    || isCloseMatch(incoming, normalizedValue)
    || isCloseMatch(incoming, normalizedLabel)
    || (normalizedValue === 'yes' && yesWords.includes(incoming))
    || (normalizedValue === 'no' && noWords.includes(incoming));
};

const applyChatbotActions = async (leadId, actions = {}) => {
  const update = {};

  if (actions.setStatus) {
    update.$set = { ...(update.$set || {}), status: actions.setStatus };
  }

  if (actions.addTags?.length) {
    update.$addToSet = { tags: { $each: actions.addTags.filter(Boolean) } };
  }

  if (Object.keys(update).length) {
    await Lead.findByIdAndUpdate(leadId, update);
  }
};

const formatFlowAnswers = (answers = {}) => {
  return Object.entries(answers)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
    .join('\n');
};

const handleFlowSubmission = async (schoolId, lead, normalized, rawPayload) => {
  const answers = normalized.flowResponse || {};
  const flow = normalized.flowToken
    ? await WhatsAppFlow.findOne({ _id: normalized.flowToken, schoolId })
    : await WhatsAppFlow.findOne({ schoolId, metaFlowId: answers.flow_id || answers.flowId });
  const answerText = formatFlowAnswers(answers);

  await WhatsAppFlowSubmission.create({
    schoolId,
    flowId: flow?._id,
    metaFlowId: flow?.metaFlowId || answers.flow_id || answers.flowId,
    leadId: lead._id,
    phone: lead.phone,
    name: lead.name,
    answers,
    ...(shouldStoreRawPayloads() ? { rawPayload } : {})
  });

  const update = {
    ...leadConversationUpdate({
      from: 'user',
      message: `WhatsApp Flow submitted${answerText ? `\n${answerText}` : ''}`,
      timestamp: new Date()
    }, {
      status: 'interested',
      notes: `${lead.notes ? `${lead.notes}\n\n` : ''}WhatsApp Flow Submission${flow?.title ? ` - ${flow.title}` : ''}\n${answerText}`
    }),
    $addToSet: {
      tags: {
        $each: ['flow-submitted', flow?.name].filter(Boolean)
      }
    }
  };

  await Lead.findByIdAndUpdate(lead._id, update);
  await sendBotResponse(
    schoolId,
    lead,
    'Thanks for submitting the admission form. Our team has received your details and will contact you shortly.'
  );
  await sendAdmissionInfoPack(schoolId, lead);
};

const findAdmissionFlow = async (schoolId) => {
  return WhatsAppFlow.findOne({
    schoolId,
    metaFlowId: { $exists: true, $ne: '' },
    $or: [
      { name: /admission|student|apply|lead/i },
      { title: /admission|student|apply|lead/i },
      { category: 'LEAD_GENERATION' }
    ]
  }).sort({ updatedAt: -1 });
};

const shouldOpenAdmissionFlow = (text = '') => {
  const intentText = getIntentText(text);
  const normalized = normalizeMessage(text);

  return intentText === 'admission'
    || intentText === 'apply'
    || /apply|join|admission|admissions|addmission|admision|school join|student form|admission inquiry/i.test(normalized);
};

const sendAdmissionFlowMessage = async (schoolId, lead, triggerText = '') => {
  const flow = await findAdmissionFlow(schoolId);
  if (!flow) return null;

  const result = await createWhatsAppService(schoolId).sendFlowMessage(lead.phone, flow, {
    cta: 'Apply Now',
    header: flow.title || 'Student Admission Form',
    body: 'Please complete this short admission form. Our counselor will contact you after submission.',
    footer: 'Bkgis'
  });

  if (result.success) {
    await Lead.findByIdAndUpdate(lead._id, {
      ...leadConversationUpdate({
        from: 'school',
        message: `Apply Now form sent${triggerText ? ` for: ${triggerText}` : ''}`,
        timestamp: new Date(),
        messageId: result.messageId,
        status: 'sent'
      }, {
        'chatbotSession.isActive': false,
        'chatbotSession.updatedAt': new Date()
      }),
      $addToSet: {
        tags: { $each: ['flow-triggered', 'admission-flow'] }
      }
    });
  }

  return result;
};

const sendBotResponse = async (schoolId, lead, response, rule = null) => {
  if (!response) return null;

  const school = await School.findById(schoolId);
  const personalizedResponse = personalizeMessage(response, school, lead);
  const whatsappService = createWhatsAppService(schoolId);
  const result = rule?.responseType === 'image' && rule?.mediaUrl
    ? await whatsappService.sendImageMessage(lead.phone, rule.mediaUrl, personalizedResponse)
    : await whatsappService.sendMessage(lead.phone, personalizedResponse);

  if (result.success) {
    await Lead.findByIdAndUpdate(lead._id, leadConversationUpdate({
      from: 'school',
      message: personalizedResponse,
      timestamp: new Date(),
      messageId: result.messageId,
      status: 'sent'
    }));
  }

  return result;
};

const handleOptOut = async (schoolId, lead, message) => {
  const now = new Date();
  await Lead.findByIdAndUpdate(lead._id, {
    $set: {
      marketingOptOut: true,
      marketingOptOutAt: now,
      marketingOptOutReason: message,
      status: lead.status === 'converted' ? lead.status : 'not_interested',
      lastMessage: message,
      lastMessageAt: now,
      'chatbotSession.isActive': false,
      'chatbotSession.updatedAt': now
    },
    $addToSet: {
      tags: { $each: ['opted_out', 'do_not_send'] }
    }
  });

  return sendBotResponse(
    schoolId,
    lead,
    'You have been opted out from future marketing messages. If this was a mistake, reply START.'
  );
};

const handleOptIn = async (schoolId, lead) => {
  const now = new Date();
  await Lead.findByIdAndUpdate(lead._id, {
    $set: {
      marketingOptOut: false,
      marketingOptOutReason: '',
      lastMessageAt: now,
      'chatbotSession.updatedAt': now
    },
    $unset: {
      marketingOptOutAt: ''
    },
    $pull: {
      tags: { $in: ['opted_out', 'do_not_send', 'unsubscribe', 'unsubscribed', 'stop'] }
    }
  });

  return sendBotResponse(
    schoolId,
    lead,
    'You are subscribed again. You can reply STOP anytime to opt out from marketing messages.'
  );
};

// @desc    Webhook for incoming WhatsApp messages
// @route   POST /api/webhook/whatsapp
// @access  Public
exports.receiveWhatsAppMessage = async (req, res) => {
  try {
    const { type, payload } = req.body;
    webhookLog('received', {
      object: req.body.object,
      type,
      entries: req.body.entry?.length,
      hasPayload: Boolean(payload)
    });

    if (req.body.object === 'whatsapp_business_account' && Array.isArray(req.body.entry)) {
      if (!verifyMetaSignature(req)) {
        return res.status(403).json({ success: false, message: 'Invalid Meta webhook signature' });
      }

      await handleMetaWebhook(req.body.entry);
      return res.status(200).json({ success: true });
    }

    // Handle different message types
    if (type === 'message') {
      await handleIncomingMessage(payload);
    } else if (type === 'event') {
      await handleStatusUpdate(payload);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(200).json({ success: true }); // Always return 200 to prevent retries
  }
};

const handleMetaWebhook = async (entries = []) => {
  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const metadata = value.metadata || {};

      await handleMetaAccountEvent(change, entry);

      for (const message of value.messages || []) {
        await handleIncomingMessage({
          ...message,
          contacts: value.contacts,
          metadata,
          phoneNumberId: metadata.phone_number_id,
          phone_number_id: metadata.phone_number_id,
          phoneNumber: metadata.display_phone_number
        });
      }

      for (const status of value.statuses || []) {
        await handleStatusUpdate({
          ...status,
          phoneNumberId: metadata.phone_number_id,
          phone_number_id: metadata.phone_number_id,
          messageId: status.id,
          status: status.status
        });
      }
    }
  }
};

const normalizeBusinessVerificationStatus = (status) => {
  const value = String(status || '').toUpperCase();
  if (['APPROVED', 'VERIFIED', 'VERIFIED_ACCOUNT'].includes(value)) return 'verified';
  if (['REJECTED', 'DECLINED', 'FAILED'].includes(value)) return 'rejected';
  if (['PENDING', 'IN_REVIEW', 'UNDER_REVIEW', 'NOT_VERIFIED'].includes(value)) return 'pending';
  return undefined;
};

const handleMetaAccountEvent = async (change = {}, entry = {}) => {
  const value = change.value || {};
  const wabaId = readFirst(value.waba_id, value.id, entry.id);
  const phoneNumberId = readFirst(value.phone_number_id, value.metadata?.phone_number_id);
  const query = [];

  if (wabaId) query.push({ wabaId });
  if (phoneNumberId) query.push({ phoneNumberId });
  if (!query.length) return;

  const update = {
    lastOnboardingEventAt: new Date()
  };

  if (change.field === 'account_review_update') {
    update.accountReviewStatus = value.decision || value.account_review_status || 'PENDING';
    update.businessVerificationStatus = normalizeBusinessVerificationStatus(update.accountReviewStatus) || 'pending';
  }

  if (change.field === 'account_update' && value.event) {
    const businessStatus = normalizeBusinessVerificationStatus(value.event);
    if (businessStatus) update.businessVerificationStatus = businessStatus;
  }

  if (change.field === 'phone_number_name_update') {
    if (value.requested_verified_name) update.displayName = value.requested_verified_name;
    if (value.decision === 'APPROVED') update.businessVerificationStatus = 'verified';
    if (value.decision === 'REJECTED') update.businessVerificationStatus = 'rejected';
  }

  if (Object.keys(update).length <= 1) return;

  const account = await WhatsAppAccount.findOneAndUpdate(
    { $or: query },
    update,
    { new: true }
  );

  if (account) {
    await School.findByIdAndUpdate(account.schoolId, {
      $set: Object.fromEntries(
        Object.entries(update).map(([key, value]) => [`whatsapp.${key}`, value])
      )
    });
  }
};

const verifyMetaSignature = (req) => {
  if (!process.env.META_APP_SECRET) return true;

  const signature = req.get('x-hub-signature-256');
  if (!signature || !req.rawBody) return false;

  const expected = `sha256=${crypto
    .createHmac('sha256', process.env.META_APP_SECRET)
    .update(req.rawBody)
    .digest('hex')}`;

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signature);

  return expectedBuffer.length === receivedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
};

// Handle incoming message
const handleIncomingMessage = async (payload) => {
  const { school, normalized } = await findSchoolForPayload(payload);
  const { phone, message, name, appName, phoneNumberId, wabaId, metaMessageId, messageType, flowResponse } = normalized;
  webhookLog('incoming normalized', { phone, message, appName, phoneNumberId, wabaId, metaMessageId, messageType });
  
  if (!school) {
    webhookLog('school not found', { appName, phoneNumberId, wabaId });
    return;
  }

  if (!phone || !message) {
    webhookLog('payload missing phone or message', { phone, message });
    return;
  }
  webhookLog('school found', { schoolId: school._id.toString(), schoolName: school.name });

  // Find or create lead
  const lead = await Lead.findOrCreate(school._id, phone, {
    name: name || phone,
    source: 'whatsapp_inbound',
    status: 'new'
  });

  if (flowResponse) {
    webhookLog('flow submission received', {
      schoolId: school._id.toString(),
      leadId: lead._id.toString(),
      keys: Object.keys(flowResponse)
    });
    await handleFlowSubmission(school._id, lead, normalized, payload);
    return;
  }

  await Promise.all([
    Lead.findByIdAndUpdate(lead._id, leadConversationUpdate({
      from: 'user',
      message,
      timestamp: new Date()
    })),
    Message.findOneAndUpdate(
      { metaMessageId: metaMessageId || `inbound_${school._id}_${phone}_${Date.now()}` },
      compactMessageRecord({
        schoolId: school._id,
        leadId: lead._id,
        phoneNumberId,
        wabaId,
        userNumber: phone,
        direction: 'inbound',
        message,
        messageType,
        metaMessageId,
        status: 'received',
        rawPayload: payload
      }),
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
  ]);

  if (isOptOutMessage(message)) {
    webhookLog('opt-out received', { schoolId: school._id.toString(), leadId: lead._id.toString(), phone });
    await handleOptOut(school._id, lead, message);
    return;
  }

  if (isOptInMessage(message) && lead.marketingOptOut) {
    webhookLog('opt-in received', { schoolId: school._id.toString(), leadId: lead._id.toString(), phone });
    await handleOptIn(school._id, lead);
    return;
  }

  // Check for chatbot response
  await processChatbot(school._id, lead, message);
};

// Handle status updates (delivered, read)
const handleStatusUpdate = async (payload) => {
  const { messageId, status } = payload;
  const updateField = status === 'read' ? 'readAt'
    : status === 'delivered' ? 'deliveredAt'
      : status === 'failed' ? 'failedAt'
        : null;
  const statusTime = new Date();

  if (messageId) {
    await Message.findOneAndUpdate(
      { metaMessageId: messageId },
      {
        status,
        ...(updateField ? { [updateField]: statusTime } : {})
      }
    );

    const broadcast = await Broadcast.findOne({ 'recipients.messageId': messageId });
    if (broadcast) {
      const recipient = broadcast.recipients.find((item) => item.messageId === messageId);
      if (recipient) {
        recipient.status = status;
        if (status === 'delivered') recipient.deliveredAt = statusTime;
        if (status === 'read') {
          recipient.readAt = statusTime;
          recipient.deliveredAt = recipient.deliveredAt || statusTime;
        }
        if (status === 'failed') {
          const metaError = payload.errors?.[0] || {};
          recipient.error = metaError.title || metaError.message || 'Meta delivery failed';
          recipient.errorCode = metaError.code ? String(metaError.code) : undefined;
          recipient.errorDetails = metaError.error_data?.details || metaError.details || undefined;
          recipient.failedAt = statusTime;
        }

        broadcast.sentCount = broadcast.recipients.filter((item) => ['sent', 'delivered', 'read'].includes(item.status)).length;
        broadcast.deliveredCount = broadcast.recipients.filter((item) => ['delivered', 'read'].includes(item.status)).length;
        broadcast.readCount = broadcast.recipients.filter((item) => item.status === 'read').length;
        broadcast.failedCount = broadcast.recipients.filter((item) => item.status === 'failed').length;
        await broadcast.save();
      }
    }
  }

  // Update lead conversation status
  const lead = await Lead.findOne({ 
    'conversation.messageId': messageId 
  });

  if (lead) {
    await Lead.updateOne(
      { _id: lead._id, 'conversation.messageId': messageId },
      { 
        $set: { 
          'conversation.$.status': status,
          ...(updateField ? { [updateField]: statusTime } : {})
        } 
      }
    );

    // Update school analytics
    if (status === 'delivered') {
      await School.findByIdAndUpdate(lead.schoolId, {
        $inc: { 'analytics.totalMessagesDelivered': 1 }
      });
    } else if (status === 'read') {
      await School.findByIdAndUpdate(lead.schoolId, {
        $inc: { 'analytics.totalMessagesRead': 1 }
      });
    }
  }
};

// Process chatbot
const processChatbot = async (schoolId, lead, message) => {
  try {
    webhookLog('chatbot start', { schoolId: schoolId.toString(), leadId: lead._id.toString(), message });
    const activeLead = await Lead.findById(lead._id);
    const intentText = getIntentText(message);

    if (activeLead?.chatbotSession?.isActive && intentText === 'hi') {
      await Lead.findByIdAndUpdate(activeLead._id, {
        $set: {
          'chatbotSession.isActive': false,
          'chatbotSession.updatedAt': new Date()
        }
      });
      webhookLog('active flow reset by menu intent');
    } else if (activeLead?.chatbotSession?.isActive) {
      const flowRule = await ChatbotRule.findOne({
        _id: activeLead.chatbotSession.ruleId,
        schoolId,
        isActive: true,
        ruleType: 'flow'
      });

      if (flowRule) {
        const currentStep = flowRule.flow?.steps?.find((step) => step.id === activeLead.chatbotSession.currentStepId);
        const incoming = normalizeMessage(message);
        const selectedOption = currentStep?.options?.find((option, index) => {
          return matchesFlowOption(option, incoming, index);
        });

        if (!selectedOption && currentStep?.inputType && currentStep?.nextStepId) {
          const nextStep = flowRule.flow.steps.find((step) => step.id === currentStep.nextStepId);
          const response = buildStepMessage(nextStep);
          const update = {
            $set: {
              'chatbotSession.currentStepId': currentStep.nextStepId,
              'chatbotSession.updatedAt': new Date()
            }
          };

          if (currentStep.saveAnswerAs) {
            update.$set.notes = `${activeLead.notes ? `${activeLead.notes}\n` : ''}${currentStep.saveAnswerAs}: ${message}`;
          }

          await Lead.findByIdAndUpdate(activeLead._id, update);
          await sendBotResponse(schoolId, activeLead, response, flowRule);
          return;
        }

        if (selectedOption) {
          await applyChatbotActions(activeLead._id, {
            addTags: selectedOption.addTags,
            setStatus: selectedOption.setStatus
          });

          const selectedIntent = `${selectedOption.label || ''} ${selectedOption.value || ''} ${selectedOption.response || ''}`;
          if (shouldOpenAdmissionFlow(selectedIntent)) {
            const flowResult = await sendAdmissionFlowMessage(schoolId, activeLead, selectedOption.label || message);
            if (flowResult?.success) {
              webhookLog('admission flow sent from button click', {
                messageId: flowResult.messageId,
                trigger: selectedOption.label
              });
              await sendAdmissionInfoPack(schoolId, activeLead);
              return;
            }
          }

          let response = selectedOption.response || '';
          let nextStepId = selectedOption.nextStepId;

          if (nextStepId && !selectedOption.endFlow) {
            const nextStep = flowRule.flow.steps.find((step) => step.id === nextStepId);
            const nextMessage = buildStepMessage(nextStep);
            response = response ? `${response}\n\n${nextMessage}` : nextMessage;

            await Lead.findByIdAndUpdate(activeLead._id, {
              $set: {
                'chatbotSession.currentStepId': nextStepId,
                'chatbotSession.updatedAt': new Date()
              }
            });
          } else {
            await Lead.findByIdAndUpdate(activeLead._id, {
              $set: {
                'chatbotSession.isActive': false,
                'chatbotSession.updatedAt': new Date()
              }
            });
          }

          flowRule.triggerCount += 1;
          flowRule.lastTriggered = new Date();
          await flowRule.save();
          await sendBotResponse(schoolId, activeLead, response, flowRule);
          if (selectedOption.sendAdmissionInfo) {
            await sendAdmissionInfoPack(schoolId, activeLead);
          }
          return;
        }

        const fallback = currentStep?.fallbackResponse || 'Please reply with one of the listed options.';
        await sendBotResponse(schoolId, activeLead, fallback, flowRule);
        return;
      }
    }

    if (shouldOpenAdmissionFlow(message)) {
      const flowResult = await sendAdmissionFlowMessage(schoolId, lead, message);
      if (flowResult?.success) {
        webhookLog('admission flow sent from keyword intent', {
          messageId: flowResult.messageId,
          trigger: message
        });
        await sendAdmissionInfoPack(schoolId, lead);
        return;
      }
    }

    // Get all active chatbot rules
    const rules = await ChatbotRule.find({ 
      schoolId, 
      isActive: true 
    }).sort({ priority: -1 });
    webhookLog('active rules', rules.map((rule) => ({
      keyword: rule.keyword,
      matchType: rule.matchType,
      priority: rule.priority,
      ruleType: rule.ruleType
    })));

    let response = null;
    let matchedRule = null;

    // Match keyword
    for (const rule of rules) {
      let matched = false;
      
      if (rule.matchType === 'exact') {
        matched = intentText === rule.keyword.toLowerCase() || isCloseMatch(intentText, rule.keyword);
      } else if (rule.matchType === 'contains') {
        matched = intentText.includes(rule.keyword.toLowerCase())
          || message.toLowerCase().includes(rule.keyword.toLowerCase())
          || isCloseMatch(intentText, rule.keyword)
          || isCloseMatch(message, rule.keyword);
      } else if (rule.matchType === 'starts_with') {
        matched = intentText.startsWith(rule.keyword.toLowerCase())
          || message.toLowerCase().startsWith(rule.keyword.toLowerCase())
          || isCloseMatch(intentText, rule.keyword);
      }

      if (matched) {
        webhookLog('rule matched', {
          keyword: rule.keyword,
          intentText,
          incoming: message,
          ruleType: rule.ruleType
        });
        matchedRule = rule;
        if (rule.ruleType === 'flow') {
          const startStep = rule.flow?.steps?.find((step) => step.id === rule.flow?.startStepId) || rule.flow?.steps?.[0];
          response = buildStepMessage(startStep) || rule.response;
          await Lead.findByIdAndUpdate(lead._id, {
            $set: {
              chatbotSession: {
                ruleId: rule._id,
                currentStepId: startStep?.id || rule.flow?.startStepId,
                isActive: true,
                updatedAt: new Date()
              }
            }
          });
        } else {
          response = rule.response;
          await applyChatbotActions(lead._id, rule.actions);
        }
        
        // Update trigger count
        rule.triggerCount += 1;
        rule.lastTriggered = new Date();
        await rule.save();
        break;
      }
    }

    // If no keyword match, send main menu (always respond)
    if (!response) {
      const mainMenuRule = rules.find(rule => rule.keyword === 'hi');
      if (mainMenuRule) {
        webhookLog('no rule matched, using hi menu');
        response = mainMenuRule.response;
        matchedRule = mainMenuRule;
        await applyChatbotActions(lead._id, mainMenuRule.actions);
        
        // Update trigger count
        mainMenuRule.triggerCount += 1;
        mainMenuRule.lastTriggered = new Date();
        await mainMenuRule.save();
      } else {
        // Fallback if no main menu rule
        const fallbackRule = await ChatbotRule.findOne({ 
          schoolId, 
          isActive: true,
          isFallback: true 
        });
        
        if (fallbackRule) {
          webhookLog('no rule matched, using fallback');
          response = fallbackRule.fallbackMessage || fallbackRule.response;
          matchedRule = fallbackRule;
        }
      }
    }

    // Send response if found
    if (response) {
      const result = await sendBotResponse(schoolId, lead, response, matchedRule);
      if (matchedRule?.actions?.sendAdmissionInfo) {
        await sendAdmissionInfoPack(schoolId, lead);
      }
      webhookLog('bot send result', {
        success: result?.success,
        messageId: result?.messageId,
        error: result?.error,
        matchedKeyword: matchedRule?.keyword
      });
    } else {
      webhookLog('no chatbot response found');
    }
  } catch (error) {
    console.error('Chatbot processing error:', error);
  }
};

// @desc    Webhook verification for Meta Cloud API
// @route   GET /api/webhook/whatsapp
// @access  Public
exports.verifyWebhook = async (req, res) => {
  try {
    if (req.query.state && req.query.callbackUrl) {
      const callbackUrl = new URL(req.query.callbackUrl);

      Object.entries(req.query).forEach(([key, value]) => {
        if (key !== 'callbackUrl' && key !== 'redirectUrl') {
          callbackUrl.searchParams.set(key, value);
        }
      });

      return res.redirect(callbackUrl.toString());
    }

    const mode = req.query['hub.mode'] || req.query.mode;
    const token = req.query['hub.verify_token'] || req.query.token;
    const challenge = req.query['hub.challenge'] || req.query.challenge;

    if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }

    if (mode === 'verify') {
      // Verify webhook token
      const school = await School.findOne({ 
        'whatsapp.webhookSecret': token 
      });

      if (school) {
        return res.status(200).send(challenge);
      }
    }

    res.status(403).json({ success: false, message: 'Invalid verification' });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
