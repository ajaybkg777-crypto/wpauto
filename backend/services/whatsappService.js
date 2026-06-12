const School = require('../models/School');
const WhatsAppAccount = require('../models/WhatsAppAccount');
const { decryptSecret } = require('../utils/tokenVault');

const workingTokenCache = new Map();
const configCache = new Map();
const CONFIG_CACHE_TTL_MS = 60 * 1000;

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

    for (const accessToken of tokens) {
      const response = await fetch(this.getMetaMessagesUrl(config.phoneNumberId), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

      const data = await response.json();

      if (!response.ok || data.error) {
        const errorMessage = data.error?.message || 'Meta WhatsApp send failed';
        const isAuthError = response.status === 401
          || data.error?.code === 190
          || /auth|token|permission/i.test(errorMessage);
        lastError = new Error(errorMessage);

        if (isAuthError && tokens.length > 1) {
          continue;
        }

        throw lastError;
      }

      workingTokenCache.set(config.phoneNumberId, accessToken);

      return {
        success: true,
        messageId: data.messages?.[0]?.id,
        data
      };
    }

    throw lastError || new Error('Meta WhatsApp send failed');
  }

  async sendMessage(phone, message) {
    const config = await this.getSchoolConfig();
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
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
        error: error.message
      };
    }
  }

  async sendImageMessage(phone, imageUrl, caption = '') {
    const config = await this.getSchoolConfig();
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
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
        error: error.message
      };
    }
  }

  async sendDocumentMessage(phone, documentUrl, filename = 'brochure.pdf', caption = '') {
    const config = await this.getSchoolConfig();
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
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
        error: error.message
      };
    }
  }

  async sendVideoMessage(phone, videoUrl, caption = '') {
    const config = await this.getSchoolConfig();
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
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
        error: error.message
      };
    }
  }

  async sendTemplateMessage(phone, templateId, variables = {}) {
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
      to: phone,
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
        error: error.message
      };
    }
  }

  async sendFlowMessage(phone, flow, options = {}) {
    const config = await this.getSchoolConfig();

    if (!flow?.metaFlowId) {
      return {
        success: false,
        error: 'Submit and sync this WhatsApp Flow with Meta before sending it'
      };
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
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
        error: error.message
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
          results.errors.push({ phone: recipient.phone, error: result.error });
          return { ...recipient, status: 'failed', error: result.error };
        } catch (error) {
          results.failed += 1;
          results.errors.push({ phone: recipient.phone, error: error.message });
          return { ...recipient, status: 'failed', error: error.message };
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
