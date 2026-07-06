const School = require('../models/School');
const WhatsAppAccount = require('../models/WhatsAppAccount');
const { decryptSecret } = require('../utils/tokenVault');
const { normalizeMetaError } = require('../utils/metaErrors');

const workingTokenCache = new Map();
const configCache = new Map();
const CONFIG_CACHE_TTL_MS = 60 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readPositiveInt = (value, fallback, max = 60000) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(Math.floor(number), max);
};

const normalizeRecipientPhone = (phone) => {
  const raw = String(phone || '').trim();
  if (!raw) return null;

  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  digits = digits.replace(/\D/g, '');

  if (digits.length === 10) {
    const countryCode = String(process.env.DEFAULT_COUNTRY_CODE || '91').replace(/\D/g, '');
    digits = `${countryCode}${digits}`;
  }

  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
};

const invalidPhoneResult = () => ({
  success: false,
  error: 'Invalid WhatsApp phone number. Use country code format, for example 919999999999.',
  errorCode: 'INVALID_PHONE_NUMBER',
  retryable: false
});

const createMetaError = (response, data) => {
  const normalized = normalizeMetaError(data?.error || {});
  const error = new Error(normalized.message || 'Meta WhatsApp send failed');
  error.statusCode = response.status;
  error.code = normalized.code;
  error.errorSubcode = data?.error?.error_subcode;
  error.details = normalized.details;
  error.retryable = normalized.retryable;
  return error;
};

const createFetchError = (error) => {
  const next = new Error('Could not reach Meta WhatsApp API after retries.');
  next.code = 'META_FETCH_FAILED';
  next.details = error?.cause?.message || error?.message || 'Network request failed before Meta accepted the message';
  next.retryable = true;
  return next;
};

const createBadResponseError = (response, bodyText = '') => {
  const error = new Error('Meta WhatsApp API returned an unreadable response.');
  error.statusCode = response.status;
  error.code = 'META_BAD_RESPONSE';
  error.details = bodyText ? bodyText.slice(0, 500) : `HTTP ${response.status}`;
  error.retryable = !response.ok || response.status >= 500;
  return error;
};

const createMissingMessageIdError = (response, data) => {
  const error = new Error('Meta WhatsApp API did not return a message ID.');
  error.statusCode = response.status;
  error.code = 'META_MISSING_MESSAGE_ID';
  error.details = JSON.stringify(data || {}).slice(0, 500);
  error.retryable = false;
  return error;
};

const isTransientMetaError = (response, data) => {
  const message = data?.error?.message || '';
  const code = data?.error?.code;
  return response.status === 429
    || response.status >= 500
    || code === 4
    || code === 17
    || code === 32
    || /rate|limit|temporary|try again/i.test(message);
};

class WhatsAppService {
  constructor(schoolId) {
    this.schoolId = schoolId;
  }

  async getSchoolConfig() {
    const cacheKey = String(this.schoolId);
    const cached = configCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.config;
    }

    const [school, account] = await Promise.all([
      School.findById(this.schoolId),
      WhatsAppAccount.findOne({ schoolId: this.schoolId }).select('+accessToken +webhookSecret')
    ]);

    const source = account?.status === 'connected' ? account : school?.whatsapp;

    if (!school || !source || source.isConnected === false || source.status === 'disconnected') {
      throw new Error('WhatsApp Cloud API is not configured for this school');
    }

    const accountAccessToken = decryptSecret(account?.accessToken);
    const envAccessToken = decryptSecret(process.env.META_SYSTEM_USER_ACCESS_TOKEN);
    const accessTokenCandidates = [accountAccessToken, envAccessToken].filter((token, index, tokens) => {
      return token && tokens.indexOf(token) === index;
    });
    const accessToken = accessTokenCandidates[0];
    const phoneNumberId = source.phoneNumberId || account?.phoneNumberId || school.whatsapp.phoneNumberId || process.env.META_PHONE_NUMBER_ID;

    if (!phoneNumberId) {
      throw new Error('Meta phone number ID is missing for this school');
    }

    if (!accessToken) {
      throw new Error('Meta access token is missing for this school');
    }

    const config = {
      ...(typeof source.toObject === 'function' ? source.toObject() : source),
      provider: 'meta',
      accessToken,
      accessTokenCandidates,
      phoneNumberId,
      schoolLogo: school.logo,
      includeLogoInMessages: school.branding?.includeLogoInMessages !== false
    };

    configCache.set(cacheKey, {
      config,
      expiresAt: Date.now() + CONFIG_CACHE_TTL_MS
    });

    return config;
  }

  getMetaMessagesUrl(phoneNumberId) {
    const version = process.env.META_GRAPH_API_VERSION || 'v22.0';
    return `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
  }

  getMetaMessageUrl(messageId) {
    const version = process.env.META_GRAPH_API_VERSION || 'v22.0';
    return `https://graph.facebook.com/${version}/${messageId}`;
  }

  async sendMetaPayload(payload, config) {
    if (process.env.WHATSAPP_SEND_ENABLED === 'false') {
      return {
        success: true,
        messageId: `dry_run_meta_${Date.now()}`,
        data: { dryRun: true, payload }
      };
    }

    const cachedToken = workingTokenCache.get(config.phoneNumberId);
    const tokenCandidates = config.accessTokenCandidates?.length
      ? config.accessTokenCandidates
      : [config.accessToken].filter(Boolean);
    const tokens = cachedToken
      ? [cachedToken, ...tokenCandidates.filter((token) => token !== cachedToken)]
      : tokenCandidates;
    let lastError = null;
    const maxAttempts = readPositiveInt(process.env.WHATSAPP_SEND_RETRIES, 5, 10);
    const retryDelayMs = readPositiveInt(process.env.WHATSAPP_SEND_RETRY_DELAY_MS, 2000, 60000);
    const requestTimeoutMs = readPositiveInt(process.env.WHATSAPP_SEND_TIMEOUT_MS, 45000, 120000);

    for (const accessToken of tokens) {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        let response;
        let data;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

        try {
          response = await fetch(this.getMetaMessagesUrl(config.phoneNumberId), {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            signal: controller.signal,
            body: JSON.stringify(payload)
          });
        } catch (error) {
          lastError = createFetchError(error);
          if (attempt < maxAttempts) {
            await sleep(retryDelayMs * attempt);
            continue;
          }
          throw lastError;
        } finally {
          clearTimeout(timeout);
        }

        let bodyText = '';
        try {
          bodyText = await response.text();
          data = bodyText ? JSON.parse(bodyText) : {};
        } catch (error) {
          lastError = createBadResponseError(response, bodyText || error.message);
          if (lastError.retryable && attempt < maxAttempts) {
            await sleep(retryDelayMs * attempt);
            continue;
          }
          throw lastError;
        }

        if (!response.ok || data.error) {
          const errorMessage = data.error?.message || 'Meta WhatsApp send failed';
          const isAuthError = response.status === 401
            || data.error?.code === 190
            || /auth|token|permission/i.test(errorMessage);
          lastError = createMetaError(response, data);

          if (isAuthError && tokens.length > 1) {
            break;
          }

          if (isTransientMetaError(response, data) && attempt < maxAttempts) {
            await sleep(retryDelayMs * attempt);
            continue;
          }

          throw lastError;
        }

        const messageId = data.messages?.[0]?.id;
        if (!messageId) {
          throw createMissingMessageIdError(response, data);
        }

        workingTokenCache.set(config.phoneNumberId, accessToken);

        return {
          success: true,
          messageId,
          data
        };
      }
    }

    throw lastError || new Error('Meta WhatsApp send failed');
  }

  async sendMessage(phone, message) {
    const normalizedPhone = normalizeRecipientPhone(phone);
    if (!normalizedPhone) return invalidPhoneResult();

    const config = await this.getSchoolConfig();
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedPhone,
      type: 'text',
      text: {
        preview_url: false,
        body: message
      }
    };

    try {
      return await this.sendMetaPayload(payload, config);
    } catch (error) {
      console.error('Meta WhatsApp send error:', error);
      return {
        success: false,
        error: error.message,
        errorCode: error.code,
        errorDetails: error.details,
        retryable: error.retryable
      };
    }
  }

  async sendImageMessage(phone, imageUrl, caption = '') {
    const normalizedPhone = normalizeRecipientPhone(phone);
    if (!normalizedPhone) return invalidPhoneResult();

    const config = await this.getSchoolConfig();
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedPhone,
      type: 'image',
      image: {
        link: imageUrl,
        caption
      }
    };

    try {
      return await this.sendMetaPayload(payload, config);
    } catch (error) {
      console.error('Meta WhatsApp image send error:', error);
      return {
        success: false,
        error: error.message,
        errorCode: error.code,
        errorDetails: error.details,
        retryable: error.retryable
      };
    }
  }

  async sendDocumentMessage(phone, documentUrl, filename = 'brochure.pdf', caption = '') {
    const normalizedPhone = normalizeRecipientPhone(phone);
    if (!normalizedPhone) return invalidPhoneResult();

    const config = await this.getSchoolConfig();
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedPhone,
      type: 'document',
      document: {
        link: documentUrl,
        filename,
        ...(caption ? { caption } : {})
      }
    };

    try {
      return await this.sendMetaPayload(payload, config);
    } catch (error) {
      console.error('Meta WhatsApp document send error:', error);
      return {
        success: false,
        error: error.message,
        errorCode: error.code,
        errorDetails: error.details,
        retryable: error.retryable
      };
    }
  }

  async sendVideoMessage(phone, videoUrl, caption = '') {
    const normalizedPhone = normalizeRecipientPhone(phone);
    if (!normalizedPhone) return invalidPhoneResult();

    const config = await this.getSchoolConfig();
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedPhone,
      type: 'video',
      video: {
        link: videoUrl,
        ...(caption ? { caption } : {})
      }
    };

    try {
      return await this.sendMetaPayload(payload, config);
    } catch (error) {
      console.error('Meta WhatsApp video send error:', error);
      return {
        success: false,
        error: error.message,
        errorCode: error.code,
        errorDetails: error.details,
        retryable: error.retryable
      };
    }
  }

  async sendTemplateMessage(phone, templateId, variables = {}) {
    const normalizedPhone = normalizeRecipientPhone(phone);
    if (!normalizedPhone) return invalidPhoneResult();

    const config = await this.getSchoolConfig();
    let bodyValues = [];

    if (Array.isArray(variables)) {
      bodyValues = variables;
    } else if (Array.isArray(variables?.values)) {
      bodyValues = variables.values;
    } else if (Array.isArray(variables?.bodyValues)) {
      bodyValues = variables.bodyValues;
    } else {
      bodyValues = Object.entries(variables || {})
        .filter(([key, value]) => !['language', 'values', 'bodyValues'].includes(key) && value !== undefined && value !== null)
        .map(([, value]) => value);
    }
    const components = [];

    if (variables?.headerImageUrl) {
      components.push({
        type: 'header',
        parameters: [{
          type: 'image',
          image: {
            link: variables.headerImageUrl
          }
        }]
      });
    }

    if (bodyValues.length) {
      components.push({
        type: 'body',
        parameters: bodyValues.map((value) => ({
          type: 'text',
          text: String(value)
        }))
      });
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedPhone,
      type: 'template',
      template: {
        name: templateId,
        language: {
          code: variables?.language || 'en_US'
        },
        ...(components.length ? { components } : {})
      }
    };

    try {
      return await this.sendMetaPayload(payload, config);
    } catch (error) {
      console.error('Meta WhatsApp template send error:', error);
      return {
        success: false,
        error: error.message,
        errorCode: error.code,
        errorDetails: error.details,
        retryable: error.retryable
      };
    }
  }

  async sendFlowMessage(phone, flow, options = {}) {
    const normalizedPhone = normalizeRecipientPhone(phone);
    if (!normalizedPhone) return invalidPhoneResult();

    const config = await this.getSchoolConfig();

    if (!flow?.metaFlowId) {
      return {
        success: false,
        error: 'Submit and sync this WhatsApp Flow with Meta before sending it',
        errorCode: 'FLOW_NOT_SYNCED',
        retryable: false
      };
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedPhone,
      type: 'interactive',
      interactive: {
        type: 'flow',
        header: {
          type: 'text',
          text: options.header || flow.title || 'Application Form'
        },
        body: {
          text: options.body || flow.description || 'Please complete this quick form.'
        },
        footer: {
          text: options.footer || 'Powered by WaAuto'
        },
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_token: String(flow._id),
            flow_id: String(flow.metaFlowId),
            flow_cta: options.cta || 'Apply Now',
            flow_action: 'navigate',
            flow_action_payload: {
              screen: 'FORM',
              data: {}
            }
          }
        }
      }
    };

    try {
      return await this.sendMetaPayload(payload, config);
    } catch (error) {
      console.error('Meta WhatsApp flow send error:', error);
      return {
        success: false,
        error: error.message,
        errorCode: error.code,
        errorDetails: error.details,
        retryable: error.retryable
      };
    }
  }

  async sendBulkMessages(recipients, message, onProgress) {
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    const batchSize = 100;
    const delayBetweenBatches = 3000;

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);

      const batchPromises = batch.map(async (recipient) => {
        try {
          const result = await this.sendMessage(recipient.phone, message);

          if (result.success) {
            results.success += 1;
            return { ...recipient, status: 'sent', messageId: result.messageId };
          }

          results.failed += 1;
          results.errors.push({
            phone: recipient.phone,
            error: result.error,
            errorCode: result.errorCode,
            errorDetails: result.errorDetails,
            retryable: result.retryable
          });
          return {
            ...recipient,
            status: 'failed',
            error: result.error,
            errorCode: result.errorCode,
            errorDetails: result.errorDetails,
            retryable: result.retryable
          };
        } catch (error) {
          results.failed += 1;
          results.errors.push({
            phone: recipient.phone,
            error: error.message,
            errorCode: error.code,
            errorDetails: error.details,
            retryable: error.retryable
          });
          return {
            ...recipient,
            status: 'failed',
            error: error.message,
            errorCode: error.code,
            errorDetails: error.details,
            retryable: error.retryable
          };
        }
      });

      await Promise.all(batchPromises);

      if (onProgress) {
        onProgress({
          total: recipients.length,
          processed: Math.min(i + batchSize, recipients.length),
          results
        });
      }

      if (i + batchSize < recipients.length) {
        await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
      }
    }

    return results;
  }

  async getMessageStatus(messageId) {
    const config = await this.getSchoolConfig();

    try {
      const response = await fetch(this.getMetaMessageUrl(messageId), {
        headers: {
          Authorization: `Bearer ${config.accessToken}`
        }
      });
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Get Meta message status error:', error);
      return { error: error.message };
    }
  }
}

const createWhatsAppService = (schoolId) => {
  return new WhatsAppService(schoolId);
};

module.exports = { WhatsAppService, createWhatsAppService };
