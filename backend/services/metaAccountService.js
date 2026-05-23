const School = require('../models/School');
const WhatsAppAccount = require('../models/WhatsAppAccount');
const { decryptSecret } = require('../utils/tokenVault');

const getMetaGraphBaseUrl = () => {
  const version = process.env.META_GRAPH_API_VERSION || 'v22.0';
  return `https://graph.facebook.com/${version}`;
};

const normalizeBusinessVerificationStatus = (status) => {
  const value = String(status || '').toUpperCase();
  if (['VERIFIED', 'APPROVED', 'VERIFIED_ACCOUNT'].includes(value)) return 'verified';
  if (['REJECTED', 'DECLINED', 'FAILED'].includes(value)) return 'rejected';
  if (['PENDING', 'IN_REVIEW', 'UNDER_REVIEW', 'NOT_VERIFIED'].includes(value)) return 'pending';
  return 'unknown';
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

const publicWhatsappAccount = (account, school, sync = {}) => ({
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
  qualityRating: account?.qualityRating || '',
  codeVerificationStatus: account?.codeVerificationStatus || '',
  isConnected: account?.status === 'connected' || Boolean(school?.whatsapp?.isConnected),
  onboardingStatus: account?.status || school?.whatsapp?.onboardingStatus || 'not_started',
  lastSyncedAt: account?.lastSyncedAt,
  sync
});

const getStoredMetaConfig = async (schoolId) => {
  const [school, account] = await Promise.all([
    School.findById(schoolId),
    WhatsAppAccount.findOne({ schoolId }).select('+accessToken')
  ]);

  if (!school) {
    throw new Error('School not found');
  }

  const envAccessToken = decryptSecret(process.env.META_SYSTEM_USER_ACCESS_TOKEN);
  const accountAccessToken = decryptSecret(account?.accessToken);
  const accessToken = envAccessToken || accountAccessToken;
  const phoneNumberId = account?.phoneNumberId || school.whatsapp?.phoneNumberId || process.env.META_PHONE_NUMBER_ID;
  const wabaId = account?.wabaId || school.whatsapp?.wabaId || process.env.META_WABA_ID;
  const businessId = account?.businessId || school.whatsapp?.businessId || process.env.META_BUSINESS_ID;

  return {
    school,
    account,
    accessToken,
    phoneNumberId,
    wabaId,
    businessId
  };
};

const syncMetaAccountForSchool = async (schoolId, options = {}) => {
  const { allowCachedOnError = true } = options;
  const { school, account, accessToken, phoneNumberId, wabaId, businessId } = await getStoredMetaConfig(schoolId);

  if (!accessToken || (!phoneNumberId && !wabaId)) {
    return publicWhatsappAccount(account, school, {
      status: 'not_configured',
      message: 'Meta access token or account IDs are missing'
    });
  }

  try {
    const [phone, waba] = await Promise.all([
      phoneNumberId
        ? fetchMetaGraph(`/${phoneNumberId}`, accessToken, {
            fields: 'id,display_phone_number,verified_name,code_verification_status,quality_rating'
          })
        : Promise.resolve({}),
      wabaId
        ? fetchMetaGraph(`/${wabaId}`, accessToken, {
            fields: 'id,name,account_review_status,message_template_namespace,owner_business_info'
          })
        : Promise.resolve({})
    ]);

    const resolvedBusinessId = businessId || waba.owner_business_info?.id;
    let businessVerificationStatus = account?.businessVerificationStatus || school.whatsapp?.businessVerificationStatus || 'unknown';

    if (resolvedBusinessId) {
      try {
        const business = await fetchMetaGraph(`/${resolvedBusinessId}`, accessToken, {
          fields: 'verification_status'
        });
        businessVerificationStatus = normalizeBusinessVerificationStatus(business.verification_status);
      } catch (error) {
        businessVerificationStatus = normalizeBusinessVerificationStatus(waba.account_review_status) || businessVerificationStatus;
      }
    }

    const update = {
      provider: 'meta',
      appName: waba.name || account?.appName || school.whatsapp?.appName || 'Meta WhatsApp',
      appId: account?.appId || school.whatsapp?.appId || process.env.META_APP_ID,
      phoneNumberId: phone.id || phoneNumberId || '',
      phoneNumber: phone.display_phone_number || account?.phoneNumber || school.whatsapp?.phoneNumber || '',
      displayName: phone.verified_name || account?.displayName || school.whatsapp?.displayName || school.name,
      wabaId: waba.id || wabaId || '',
      businessId: resolvedBusinessId || '',
      businessVerificationStatus,
      accountReviewStatus: waba.account_review_status || account?.accountReviewStatus || school.whatsapp?.accountReviewStatus || 'UNKNOWN',
      namespace: waba.message_template_namespace || account?.namespace || school.whatsapp?.namespace || '',
      qualityRating: phone.quality_rating || account?.qualityRating || '',
      codeVerificationStatus: phone.code_verification_status || account?.codeVerificationStatus || '',
      status: 'connected',
      connectedAt: account?.connectedAt || new Date(),
      lastSyncedAt: new Date(),
      syncError: ''
    };

    school.whatsapp.provider = update.provider;
    school.whatsapp.appName = update.appName;
    school.whatsapp.appId = update.appId;
    school.whatsapp.phoneNumberId = update.phoneNumberId;
    school.whatsapp.phoneNumber = update.phoneNumber;
    school.whatsapp.displayName = update.displayName;
    school.whatsapp.wabaId = update.wabaId;
    school.whatsapp.businessId = update.businessId;
    school.whatsapp.businessVerificationStatus = update.businessVerificationStatus;
    school.whatsapp.accountReviewStatus = update.accountReviewStatus;
    school.whatsapp.namespace = update.namespace;
    school.whatsapp.onboardingStatus = 'connected';
    school.whatsapp.isConnected = Boolean(update.phoneNumberId && update.wabaId);
    await school.save();

    const syncedAccount = await WhatsAppAccount.findOneAndUpdate(
      { schoolId },
      update,
      { upsert: true, new: true }
    );

    return publicWhatsappAccount(syncedAccount, school, {
      status: 'fresh',
      source: 'meta',
      at: update.lastSyncedAt
    });
  } catch (error) {
    if (account) {
      await WhatsAppAccount.findByIdAndUpdate(account._id, {
        lastSyncedAt: new Date(),
        syncError: error.message
      });
    }

    if (!allowCachedOnError) throw error;

    return publicWhatsappAccount(account, school, {
      status: 'cached',
      source: 'database',
      message: error.message
    });
  }
};

module.exports = {
  publicWhatsappAccount,
  syncMetaAccountForSchool
};
