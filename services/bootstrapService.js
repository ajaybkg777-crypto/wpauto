const User = require('../models/User');
const School = require('../models/School');

const seedAdminUser = async () => {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '').trim();

  if (!email || !password) return null;

  let user = await User.findOne({ email }).select('+password');
  if (user) {
    let changed = false;
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

  const school = await School.create({
    name: process.env.ADMIN_SCHOOL_NAME || 'Bkgis',
    phone: process.env.ADMIN_PHONE || ''
  });

  user = await User.create({
    name: process.env.ADMIN_NAME || 'Super Admin',
    email,
    password,
    role: 'super_admin',
    schoolId: school._id,
    authProvider: 'local',
    isEmailVerified: true,
    isActive: true
  });

  school.owner = user._id;
  await school.save();
  return user;
};

const runBootstrap = async () => {
  await seedAdminUser();
};

module.exports = { runBootstrap, seedAdminUser };
