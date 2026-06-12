const School = require('../models/School');
const Lead = require('../models/Lead');

const PLAN_CONTACT_LIMITS = {
  free: Number(process.env.LIMIT_CONTACTS_FREE || 500),
  basic: Number(process.env.LIMIT_CONTACTS_BASIC || 2000),
  pro: Number(process.env.LIMIT_CONTACTS_PRO || 10000),
  advanced: Number(process.env.LIMIT_CONTACTS_ADVANCED || 50000)
};

const areContactLimitsEnabled = () => process.env.CONTACT_LIMITS_ENABLED === 'true';

const getContactLimit = (school) => {
  if (!areContactLimitsEnabled()) return 0;

  const configured = Number(school?.limits?.maxLeads || 0);
  if (configured > 0) return configured;

  const plan = school?.subscription?.plan || 'free';
  return PLAN_CONTACT_LIMITS[plan] || PLAN_CONTACT_LIMITS.free;
};

const getContactUsage = async (schoolId) => {
  const [school, used] = await Promise.all([
    School.findById(schoolId).select('limits.maxLeads subscription.plan'),
    Lead.countDocuments({ schoolId })
  ]);

  if (!school) {
    throw new Error('School not found');
  }

  const limit = getContactLimit(school);
  return {
    limit,
    used,
    remaining: limit > 0 ? Math.max(limit - used, 0) : null,
    unlimited: limit <= 0,
    plan: school.subscription?.plan || 'free'
  };
};

const assertCanCreateContacts = async (schoolId, requested = 1) => {
  const usage = await getContactUsage(schoolId);
  if (usage.unlimited) return usage;

  if (usage.used + requested > usage.limit) {
    const available = Math.max(usage.limit - usage.used, 0);
    const suffix = requested > 1
      ? ` You can import ${available} more contact${available === 1 ? '' : 's'} right now.`
      : '';
    const error = new Error(`Contact limit reached for ${usage.plan} plan (${usage.used}/${usage.limit}).${suffix}`);
    error.statusCode = 403;
    error.usage = usage;
    throw error;
  }

  return usage;
};

module.exports = {
  areContactLimitsEnabled,
  getContactLimit,
  getContactUsage,
  assertCanCreateContacts
};
