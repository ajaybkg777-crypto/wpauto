const School = require('../models/School');
const mongoose = require('mongoose');
const User = require('../models/User');
const Lead = require('../models/Lead');
const Broadcast = require('../models/Broadcast');
const Template = require('../models/Template');
const WhatsAppAccount = require('../models/WhatsAppAccount');
const Message = require('../models/Message');
const ChatbotRule = require('../models/ChatbotRule');
const { encryptSecret } = require('../utils/tokenVault');
const { syncMetaAccountForSchool } = require('../services/metaAccountService');
const { uploadFileToCloudinary } = require('../services/cloudinaryService');

const getAssetUrl = (req, filePath) => {
  if (!filePath) return '';
  if (/^https?:\/\//i.test(filePath)) return filePath;

  const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
  return `${baseUrl}${filePath}`;
};

const toObjectId = (value) => {
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(value)) return new mongoose.Types.ObjectId(value);
  return value;
};

const firstAggregate = (items, fallback = {}) => items?.[0] || fallback;

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
    const { name, address, phone, email, website, logo, branding, category, admissionAutomation } = req.body;
    const cleanAdmissionAutomation = admissionAutomation ? {
      processText: String(admissionAutomation.processText || '').trim(),
      documentsText: String(admissionAutomation.documentsText || '').trim(),
      feeStructureText: String(admissionAutomation.feeStructureText || '').trim(),
      brochurePdfUrl: String(admissionAutomation.brochurePdfUrl || '').trim(),
      brochureFilename: String(admissionAutomation.brochureFilename || 'Admission-Brochure.pdf').trim(),
      schoolPhotoUrls: Array.isArray(admissionAutomation.schoolPhotoUrls)
        ? admissionAutomation.schoolPhotoUrls.map((url) => String(url || '').trim()).filter(Boolean)
        : String(admissionAutomation.schoolPhotoUrls || '')
          .split(',')
          .map((url) => url.trim())
          .filter(Boolean),
      campusVideoUrl: String(admissionAutomation.campusVideoUrl || '').trim()
    } : undefined;

    const school = await School.findByIdAndUpdate(
      req.schoolId,
      {
        name,
        address,
        phone,
        email,
        website,
        logo,
        branding,
        category: category || 'Education',
        ...(cleanAdmissionAutomation ? { admissionAutomation: cleanAdmissionAutomation } : {})
      },
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

    let cloudinary = null;
    try {
      cloudinary = await uploadFileToCloudinary(req.file, {
        folder: `waauto/${req.schoolId}/logos`
      });
    } catch (error) {
      console.warn('Cloudinary logo upload failed, using local upload:', error.message);
    }

    const logo = cloudinary?.url || `/uploads/logos/${req.file.filename}`;
    const school = await School.findByIdAndUpdate(
      req.schoolId,
      { logo },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      data: {
        logo,
        logoUrl: cloudinary?.url || getAssetUrl(req, logo),
        storage: cloudinary ? 'cloudinary' : 'local',
        publicId: cloudinary?.publicId,
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

// @desc    Upload admission automation media
// @route   POST /api/schools/admission-media
// @access  Private
exports.uploadAdmissionMedia = async (req, res) => {
  try {
    const { type } = req.body;
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a file'
      });
    }

    if (!['brochure', 'photo', 'video'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Choose brochure, photo, or video'
      });
    }

    let cloudinary = null;
    try {
      cloudinary = await uploadFileToCloudinary(req.file, {
        folder: `waauto/${req.schoolId}/admission-media`
      });
    } catch (error) {
      console.warn('Cloudinary admission media upload failed, using local upload:', error.message);
    }

    const filePath = `/uploads/admission-media/${req.file.filename}`;
    const fileUrl = cloudinary?.url || getAssetUrl(req, filePath);
    const update = {};

    if (type === 'brochure') {
      update['admissionAutomation.brochurePdfUrl'] = fileUrl;
      update['admissionAutomation.brochureFilename'] = req.file.originalname || 'Admission-Brochure.pdf';
    }

    if (type === 'photo') {
      update.$addToSet = { 'admissionAutomation.schoolPhotoUrls': fileUrl };
    }

    if (type === 'video') {
      update['admissionAutomation.campusVideoUrl'] = fileUrl;
    }

    const school = await School.findByIdAndUpdate(
      req.schoolId,
      update,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      data: {
        type,
        url: fileUrl,
        filename: req.file.originalname,
        storage: cloudinary ? 'cloudinary' : 'local',
        publicId: cloudinary?.publicId,
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
    const schoolObjectId = toObjectId(schoolId);

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
      outboundMessages,
      messageStatusRows,
      broadcastRecipientRows
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
      Message.countDocuments({ schoolId, direction: 'outbound' }),
      Message.aggregate([
        { $match: { schoolId: schoolObjectId } },
        {
          $group: {
            _id: null,
            inbound: {
              $sum: { $cond: [{ $eq: ['$direction', 'inbound'] }, 1, 0] }
            },
            outbound: {
              $sum: { $cond: [{ $eq: ['$direction', 'outbound'] }, 1, 0] }
            },
            sent: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$direction', 'outbound'] },
                      { $in: ['$status', ['sent', 'delivered', 'read']] }
                    ]
                  },
                  1,
                  0
                ]
              }
            },
            delivered: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$direction', 'outbound'] },
                      { $in: ['$status', ['delivered', 'read']] }
                    ]
                  },
                  1,
                  0
                ]
              }
            },
            read: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$direction', 'outbound'] },
                      { $eq: ['$status', 'read'] }
                    ]
                  },
                  1,
                  0
                ]
              }
            },
            failed: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$direction', 'outbound'] },
                      { $eq: ['$status', 'failed'] }
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        }
      ]),
      Broadcast.aggregate([
        { $match: { schoolId: schoolObjectId } },
        {
          $group: {
            _id: null,
            totalRecipients: { $sum: '$totalRecipients' },
            sent: { $sum: '$sentCount' },
            delivered: { $sum: '$deliveredCount' },
            read: { $sum: '$readCount' },
            failed: { $sum: '$failedCount' }
          }
        }
      ])
    ]);

    // Get school for analytics and the latest Meta WhatsApp account snapshot.
    const [school, whatsapp] = await Promise.all([
      School.findById(schoolId),
      syncMetaAccountForSchool(schoolId)
    ]);

    const messageStatus = firstAggregate(messageStatusRows, {
      inbound: inboundMessages,
      outbound: outboundMessages,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0
    });
    const broadcastRecipients = firstAggregate(broadcastRecipientRows, {
      totalRecipients: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0
    });
    const liveAnalytics = {
      ...(school.analytics?.toObject ? school.analytics.toObject() : school.analytics || {}),
      totalMessagesSent: Math.max(Number(messageStatus.sent) || 0, Number(broadcastRecipients.sent) || 0),
      totalMessagesDelivered: Math.max(Number(messageStatus.delivered) || 0, Number(broadcastRecipients.delivered) || 0),
      totalMessagesRead: Math.max(Number(messageStatus.read) || 0, Number(broadcastRecipients.read) || 0),
      totalMessagesFailed: Math.max(Number(messageStatus.failed) || 0, Number(broadcastRecipients.failed) || 0),
      source: 'live_mongo'
    };

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
          failed: failedBroadcasts,
          recipients: Number(broadcastRecipients.totalRecipients) || 0,
          sentRecipients: Number(broadcastRecipients.sent) || 0,
          deliveredRecipients: Number(broadcastRecipients.delivered) || 0,
          readRecipients: Number(broadcastRecipients.read) || 0,
          failedRecipients: Number(broadcastRecipients.failed) || 0
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
        analytics: liveAnalytics,
        messageLedger: {
          inbound: Number(messageStatus.inbound) || inboundMessages,
          outbound: Number(messageStatus.outbound) || outboundMessages,
          sent: Number(messageStatus.sent) || 0,
          delivered: Number(messageStatus.delivered) || 0,
          read: Number(messageStatus.read) || 0,
          failed: Number(messageStatus.failed) || 0
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
