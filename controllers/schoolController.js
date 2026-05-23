const School = require('../models/School');
const User = require('../models/User');
const Lead = require('../models/Lead');
const Broadcast = require('../models/Broadcast');
const Template = require('../models/Template');
const WhatsAppAccount = require('../models/WhatsAppAccount');
const Message = require('../models/Message');
const ChatbotRule = require('../models/ChatbotRule');
const { encryptSecret } = require('../utils/tokenVault');
const { syncMetaAccountForSchool } = require('../services/metaAccountService');

const getAssetUrl = (req, filePath) => {
  if (!filePath) return '';
  if (/^https?:\/\//i.test(filePath)) return filePath;

  const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
  return `${baseUrl}${filePath}`;
};

// @desc    Get school profile
// @route   GET /api/schools/profile
// @access  Private
exports.getProfile = async (req, res) => {
  try {
    const school = await School.findById(req.schoolId);
    
    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    res.status(200).json({
      success: true,
      data: school
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update school profile
// @route   PUT /api/schools/profile
// @access  Private
exports.updateProfile = async (req, res) => {
  try {
    const { name, address, phone, email, website, logo, branding, category } = req.body;

    const school = await School.findByIdAndUpdate(
      req.schoolId,
      { name, address, phone, email, website, logo, branding, category: category || 'Education' },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      data: school
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Upload school logo
// @route   POST /api/schools/logo
// @access  Private
exports.uploadLogo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a logo image'
      });
    }

    const logo = `/uploads/logos/${req.file.filename}`;
    const school = await School.findByIdAndUpdate(
      req.schoolId,
      { logo },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      data: {
        logo,
        logoUrl: getAssetUrl(req, logo),
        school
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get school dashboard stats
// @route   GET /api/schools/stats
// @access  Private
exports.getStats = async (req, res) => {
  try {
    const schoolId = req.schoolId;

    // Get counts
    const [
      totalLeads,
      interestedLeads,
      pendingLeads,
      notInterestedLeads,
      totalBroadcasts,
      completedBroadcasts,
      scheduledBroadcasts,
      processingBroadcasts,
      failedBroadcasts,
      totalTemplates,
      approvedTemplates,
      pendingTemplates,
      rejectedTemplates,
      totalAutomations,
      activeAutomations,
      inboundMessages,
      outboundMessages
    ] = await Promise.all([
      Lead.countDocuments({ schoolId }),
      Lead.countDocuments({ schoolId, status: 'interested' }),
      Lead.countDocuments({ schoolId, status: 'pending' }),
      Lead.countDocuments({ schoolId, status: 'not_interested' }),
      Broadcast.countDocuments({ schoolId }),
      Broadcast.countDocuments({ schoolId, status: 'completed' }),
      Broadcast.countDocuments({ schoolId, status: 'scheduled' }),
      Broadcast.countDocuments({ schoolId, status: 'processing' }),
      Broadcast.countDocuments({ schoolId, status: 'failed' }),
      Template.countDocuments({ schoolId }),
      Template.countDocuments({ schoolId, status: 'approved' }),
      Template.countDocuments({ schoolId, status: 'pending' }),
      Template.countDocuments({ schoolId, status: 'rejected' }),
      ChatbotRule.countDocuments({ schoolId }),
      ChatbotRule.countDocuments({ schoolId, isActive: true }),
      Message.countDocuments({ schoolId, direction: 'inbound' }),
      Message.countDocuments({ schoolId, direction: 'outbound' })
    ]);

    // Get school for analytics and the latest Meta WhatsApp account snapshot.
    const [school, whatsapp] = await Promise.all([
      School.findById(schoolId),
      syncMetaAccountForSchool(schoolId)
    ]);

    res.set('Cache-Control', 'no-store');
    res.status(200).json({
      success: true,
      data: {
        school: {
          name: school.name,
          email: school.email,
          phone: school.phone,
          website: school.website,
          address: school.address,
          category: school.category,
          logo: getAssetUrl(req, school.logo)
        },
        leads: {
          total: totalLeads,
          interested: interestedLeads,
          pending: pendingLeads,
          notInterested: notInterestedLeads
        },
        broadcasts: {
          total: totalBroadcasts,
          completed: completedBroadcasts,
          scheduled: scheduledBroadcasts,
          processing: processingBroadcasts,
          failed: failedBroadcasts
        },
        templates: {
          total: totalTemplates,
          approved: approvedTemplates,
          pending: pendingTemplates,
          rejected: rejectedTemplates
        },
        automations: {
          total: totalAutomations,
          active: activeAutomations
        },
        analytics: school.analytics,
        messageLedger: {
          inbound: inboundMessages,
          outbound: outboundMessages
        },
        whatsapp,
        subscription: school.subscription,
        limits: school.limits
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Configure WhatsApp
// @route   PUT /api/schools/whatsapp
// @access  Private
exports.configureWhatsApp = async (req, res) => {
  try {
    const {
      accessToken,
      appName,
      appId,
      phoneNumberId,
      phoneNumber,
      displayName,
      wabaId,
      businessId
    } = req.body;

    const school = await School.findById(req.schoolId);
    const encryptedAccessToken = accessToken ? encryptSecret(accessToken) : undefined;

    school.whatsapp = {
      provider: 'meta',
      appName: appName || school.whatsapp.appName,
      appId: appId || school.whatsapp.appId,
      phoneNumberId: phoneNumberId || school.whatsapp.phoneNumberId,
      phoneNumber: phoneNumber || school.whatsapp.phoneNumber,
      displayName: displayName || school.whatsapp.displayName,
      wabaId: wabaId || school.whatsapp.wabaId,
      businessId: businessId || school.whatsapp.businessId,
      namespace: school.whatsapp.namespace,
      onboardingStatus: 'connected',
      isConnected: true
    };

    await school.save();
    const accountUpdate = {
      provider: 'meta',
      appName: school.whatsapp.appName,
      appId: school.whatsapp.appId,
      phoneNumberId: school.whatsapp.phoneNumberId,
      phoneNumber: school.whatsapp.phoneNumber,
      displayName: school.whatsapp.displayName,
      wabaId: school.whatsapp.wabaId,
      businessId: school.whatsapp.businessId,
      namespace: school.whatsapp.namespace,
      status: 'connected',
      connectedAt: new Date()
    };

    if (encryptedAccessToken) accountUpdate.accessToken = encryptedAccessToken;

    const account = await WhatsAppAccount.findOneAndUpdate(
      { schoolId: req.schoolId },
      accountUpdate,
      { upsert: true, new: true }
    );

    res.status(200).json({
      success: true,
      message: 'WhatsApp configured successfully',
      data: {
        provider: account.provider,
        appName: account.appName,
        appId: account.appId,
        phoneNumberId: account.phoneNumberId,
        phoneNumber: account.phoneNumber,
        wabaId: account.wabaId,
        namespace: account.namespace,
        isConnected: account.status === 'connected',
        onboardingStatus: account.status
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get WhatsApp status
// @route   GET /api/schools/whatsapp/status
// @access  Private
exports.getWhatsAppStatus = async (req, res) => {
  try {
    const [school, account] = await Promise.all([
      School.findById(req.schoolId),
      WhatsAppAccount.findOne({ schoolId: req.schoolId })
    ]);

    res.status(200).json({
      success: true,
      data: {
        provider: account?.provider || school.whatsapp.provider,
        appName: account?.appName || school.whatsapp.appName,
        phoneNumber: account?.phoneNumber || school.whatsapp.phoneNumber,
        displayName: account?.displayName || school.whatsapp.displayName,
        phoneNumberId: account?.phoneNumberId || school.whatsapp.phoneNumberId,
        wabaId: account?.wabaId || school.whatsapp.wabaId,
        businessVerificationStatus: account?.businessVerificationStatus || school.whatsapp.businessVerificationStatus,
        accountReviewStatus: account?.accountReviewStatus || school.whatsapp.accountReviewStatus,
        businessId: account?.businessId || school.whatsapp.businessId,
        namespace: account?.namespace || school.whatsapp.namespace,
        isConnected: account?.status === 'connected' || school.whatsapp.isConnected,
        onboardingStatus: account?.status || school.whatsapp.onboardingStatus
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Disconnect WhatsApp
// @route   DELETE /api/schools/whatsapp
// @access  Private
exports.disconnectWhatsApp = async (req, res) => {
  try {
    const school = await School.findById(req.schoolId);

    school.whatsapp = {
      provider: 'meta',
      appName: '',
      appId: '',
      phoneNumberId: '',
      phoneNumber: '',
      displayName: '',
      wabaId: '',
      businessId: '',
      businessVerificationStatus: 'unknown',
      accountReviewStatus: 'UNKNOWN',
      webhookSecret: '',
      onboardingStatus: 'not_started',
      isConnected: false
    };

    await school.save();
    await WhatsAppAccount.findOneAndUpdate(
      { schoolId: req.schoolId },
      {
        status: 'disconnected',
        accessToken: '',
        disconnectedAt: new Date()
      }
    );

    res.status(200).json({
      success: true,
      message: 'WhatsApp disconnected successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get all schools (Super Admin)
// @route   GET /api/schools
// @access  Private (Super Admin)
exports.getAllSchools = async (req, res) => {
  try {
    const schools = await School.find().populate('owner', 'name email phone');

    res.status(200).json({
      success: true,
      count: schools.length,
      data: schools
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single school (Super Admin)
// @route   GET /api/schools/:id
// @access  Private (Super Admin)
exports.getSchool = async (req, res) => {
  try {
    const school = await School.findById(req.params.id).populate('owner', 'name email phone');

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    res.status(200).json({
      success: true,
      data: school
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update school (Super Admin)
// @route   PUT /api/schools/:id
// @access  Private (Super Admin)
exports.updateSchool = async (req, res) => {
  try {
    const school = await School.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      data: school
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete school (Super Admin)
// @route   DELETE /api/schools/:id
// @access  Private (Super Admin)
exports.deleteSchool = async (req, res) => {
  try {
    const school = await School.findById(req.params.id);

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    // Delete associated data
    await Promise.all([
      Lead.deleteMany({ schoolId: school._id }),
      Broadcast.deleteMany({ schoolId: school._id })
    ]);

    await school.deleteOne();

    res.status(200).json({
      success: true,
      message: 'School deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get main flow readiness status
// @route   GET /api/schools/main-flow
// @access  Private
exports.getMainFlowStatus = async (req, res) => {
  try {
    const [school, whatsappAccount, chatbotRules, leadCount] = await Promise.all([
      School.findById(req.schoolId),
      WhatsAppAccount.findOne({ schoolId: req.schoolId }),
      ChatbotRule.countDocuments({ schoolId: req.schoolId, isActive: true }),
      Lead.countDocuments({ schoolId: req.schoolId })
    ]);

    const hasBusinessInfo = Boolean(
      school?.name?.trim()
      && (school?.phone || school?.email || school?.website)
    );
    const whatsappConnected = Boolean(
      whatsappAccount?.status === 'connected' || school?.whatsapp?.isConnected
    );
    const businessVerified = school?.whatsapp?.businessVerificationStatus === 'verified'
      || school?.whatsapp?.accountReviewStatus === 'APPROVED'
      || whatsappAccount?.businessVerificationStatus === 'verified'
      || whatsappAccount?.accountReviewStatus === 'APPROVED';
    const hasPhoneBinding = Boolean(
      (whatsappAccount?.phoneNumberId || school?.whatsapp?.phoneNumberId)
      && (whatsappAccount?.wabaId || school?.whatsapp?.wabaId)
    );
    const hasAutomation = chatbotRules > 0;

    const steps = [
      { key: 'registration', done: true },
      { key: 'workspace_profile', done: hasBusinessInfo },
      { key: 'whatsapp_connected', done: whatsappConnected },
      { key: 'facebook_business_verified', done: businessVerified },
      { key: 'payment_method', done: false },
      { key: 'phone_connected', done: hasPhoneBinding },
      { key: 'automation_ready', done: hasAutomation },
      { key: 'contacts_ready', done: leadCount > 0 }
    ];

    const completed = steps.filter((step) => step.done).length;
    const progress = Math.round((completed / steps.length) * 100);

    res.status(200).json({
      success: true,
      data: {
        progress,
        completed,
        total: steps.length,
        steps
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
