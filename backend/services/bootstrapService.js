const mongoose = require('mongoose');
const User = require('../models/User');
const School = require('../models/School');
const WhatsAppAccount = require('../models/WhatsAppAccount');
const { encryptSecret } = require('../utils/tokenVault');
const { ensureWabaWebhookSubscription } = require('./metaWebhookService');

const seedAdminUser = async () => {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '').trim();

  if (!email || !password) return null;

  let user = await User.findOne({ email }).select('+password');
  if (user) {
    let changed = false;
    if (!user.schoolId) {
      let school = await School.findOne({ owner: user._id });
      if (!school) {
        school = await School.create({
          name: process.env.ADMIN_SCHOOL_NAME || 'Bkgis',
          phone: process.env.ADMIN_PHONE || '',
          owner: user._id
        });
      }
      user.schoolId = school._id;
      changed = true;
    }
    if (user.role !== 'super_admin') {
      user.role = 'super_admin';
      changed = true;
    }
    if (!user.isActive) {
      user.isActive = true;
      changed = true;
    }
    if (changed) await user.save();
    return user;
  }

  const userId = new mongoose.Types.ObjectId();
  const schoolId = new mongoose.Types.ObjectId();
  const school = await School.create({
    _id: schoolId,
    name: process.env.ADMIN_SCHOOL_NAME || 'Bkgis',
    phone: process.env.ADMIN_PHONE || '',
    owner: userId
  });

  user = await User.create({
    _id: userId,
    name: process.env.ADMIN_NAME || 'Super Admin',
    email,
    password,
    role: 'super_admin',
    schoolId,
    authProvider: 'local',
    isEmailVerified: true,
    isActive: true
  });

  return user;
};

const runBootstrap = async () => {
  const admin = await seedAdminUser();

  if (
    admin?.schoolId
    && process.env.META_PHONE_NUMBER_ID
    && process.env.META_WABA_ID
    && process.env.META_SYSTEM_USER_ACCESS_TOKEN
  ) {
    const school = await School.findById(admin.schoolId);
    const accountUpdate = {
      provider: 'meta',
      status: 'connected',
      appName: process.env.META_APP_NAME || 'Meta WhatsApp',
      appId: process.env.META_APP_ID,
      phoneNumberId: process.env.META_PHONE_NUMBER_ID,
      phoneNumber: process.env.META_PHONE_NUMBER || school?.whatsapp?.phoneNumber || '',
      displayName: process.env.META_DISPLAY_NAME || school?.whatsapp?.displayName || process.env.ADMIN_SCHOOL_NAME || 'Bkgis',
      wabaId: process.env.META_WABA_ID,
      businessId: process.env.META_BUSINESS_ID || school?.whatsapp?.businessId,
      accessToken: encryptSecret(process.env.META_SYSTEM_USER_ACCESS_TOKEN),
      connectedAt: new Date()
    };

    await WhatsAppAccount.findOneAndUpdate(
      { schoolId: admin.schoolId },
      accountUpdate,
      { upsert: true, new: true }
    );

    await School.findByIdAndUpdate(admin.schoolId, {
      $set: {
        'whatsapp.provider': 'meta',
        'whatsapp.isConnected': true,
        'whatsapp.appName': accountUpdate.appName,
        'whatsapp.appId': accountUpdate.appId,
        'whatsapp.phoneNumberId': accountUpdate.phoneNumberId,
        'whatsapp.phoneNumber': accountUpdate.phoneNumber,
        'whatsapp.displayName': accountUpdate.displayName,
        'whatsapp.wabaId': accountUpdate.wabaId,
        'whatsapp.businessId': accountUpdate.businessId,
        'whatsapp.connectedAt': accountUpdate.connectedAt
      }
    });

    await ensureWabaWebhookSubscription(accountUpdate.wabaId, process.env.META_SYSTEM_USER_ACCESS_TOKEN);
  }
};

module.exports = { runBootstrap, seedAdminUser };
