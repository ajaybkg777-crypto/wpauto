const User = require('../models/User');
const School = require('../models/School');
const AuthOtp = require('../models/AuthOtp');
const { generateToken } = require('../middleware/auth');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const normalizeEmail = (email = '') => String(email).trim().toLowerCase();
const isOtpRequired = () => process.env.AUTH_OTP_REQUIRED === 'true';
const canExposeOtp = () => process.env.AUTH_OTP_DEBUG === 'true' || process.env.NODE_ENV !== 'production';
const otpExpiryMinutes = Number(process.env.AUTH_OTP_EXPIRY_MINUTES || 10);

const hashOtpCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');

const getAppBaseUrl = (req) => {
  return process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
};

const decodeBase64UrlJson = (value) => {
  if (!value) return null;
  const base64 = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
};

const parseFacebookSignedRequest = (signedRequest) => {
  if (!signedRequest || !String(signedRequest).includes('.')) return null;
  const [signature, payload] = String(signedRequest).split('.', 2);

  if (process.env.META_APP_SECRET) {
    const expected = crypto
      .createHmac('sha256', process.env.META_APP_SECRET)
      .update(payload)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    if (signature !== expected) {
      throw new Error('Invalid Facebook signed request signature');
    }
  }

  return decodeBase64UrlJson(payload);
};

const verifyOtpToken = (token, email, purpose) => {
  if (!token) return false;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return payload.type === 'auth_otp'
      && payload.email === normalizeEmail(email)
      && payload.purpose === purpose;
  } catch (error) {
    return false;
  }
};

// @desc    Register school owner
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, phone, schoolName, otpToken } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (isOtpRequired() && !verifyOtpToken(otpToken, normalizedEmail, 'register')) {
      return res.status(400).json({
        success: false,
        message: 'Valid OTP verification is required for registration'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    const user = await User.create({
      name,
      email: normalizedEmail,
      password,
      phone,
      role: 'school_owner',
      authProvider: 'local',
      isEmailVerified: !isOtpRequired() || Boolean(otpToken)
    });

    try {
      const school = await School.create({
        name: schoolName || name + "'s School",
        owner: user._id,
        phone
      });

      user.schoolId = school._id;
      await user.save();
    } catch (schoolError) {
      await User.findByIdAndDelete(user._id);
      throw schoolError;
    }

    sendTokenResponse(user, 201, res);
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Login school owner
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { email, password, otpToken } = req.body;
    const normalizedEmail = normalizeEmail(email);

    // Validate email & password
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Check for user
    const user = await User.findOne({ email: normalizedEmail }).select('+password').populate('schoolId');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Check if password matches
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    if (isOtpRequired() && !verifyOtpToken(otpToken, normalizedEmail, 'login')) {
      return res.status(400).json({
        success: false,
        message: 'Valid OTP verification is required for login'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    sendTokenResponse(user, 200, res);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).populate('schoolId');

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
exports.updateProfile = async (req, res, next) => {
  try {
    const fieldsToUpdate = {
      name: req.body.name,
      phone: req.body.phone
    };

    const user = await User.findByIdAndUpdate(
      req.user.id,
      fieldsToUpdate,
      {
        new: true,
        runValidators: true
      }
    ).populate('schoolId');

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update password
// @route   PUT /api/auth/password
// @access  Private
exports.updatePassword = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('+password');

    // Check current password
    if (!(await user.matchPassword(req.body.currentPassword))) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    user.password = req.body.newPassword;
    await user.save();

    sendTokenResponse(user, 200, res);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Super Admin Login
// @route   POST /api/auth/admin-login
// @access  Public
exports.adminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Check for admin user
    const user = await User.findOne({ email, role: 'super_admin' }).select('+password').populate('schoolId');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if password matches
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    sendTokenResponse(user, 200, res);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Helper function to get token and send response
const sendTokenResponse = (user, statusCode, res) => {
  const token = generateToken(user._id);
  const safeUser = user.toObject ? user.toObject() : { ...user };
  delete safeUser.password;

  const options = {
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  };

  res.status(statusCode).cookie('token', token, options).json({
    success: true,
    token,
    data: safeUser
  });
};

// @desc    Request OTP for register/login
// @route   POST /api/auth/otp/request
// @access  Public
exports.requestOtp = async (req, res) => {
  try {
    const { email, purpose } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !['register', 'login'].includes(purpose)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide valid email and purpose'
      });
    }

    if (purpose === 'register') {
      const exists = await User.findOne({ email: normalizedEmail });
      if (exists) {
        return res.status(400).json({
          success: false,
          message: 'User already exists with this email'
        });
      }
    }

    if (purpose === 'login') {
      const exists = await User.findOne({ email: normalizedEmail });
      if (!exists) {
        return res.status(404).json({
          success: false,
          message: 'No account found with this email'
        });
      }
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + otpExpiryMinutes * 60 * 1000);

    await AuthOtp.findOneAndUpdate(
      { email: normalizedEmail, purpose },
      { codeHash: hashOtpCode(code), expiresAt, attempts: 0, verifiedAt: null },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (canExposeOtp()) {
      console.log(`[AUTH OTP] ${purpose} ${normalizedEmail}: ${code}`);
    }

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      data: {
        email: normalizedEmail,
        purpose,
        expiresAt,
        ...(canExposeOtp() ? { otp: code } : {})
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Verify OTP for register/login
// @route   POST /api/auth/otp/verify
// @access  Public
exports.verifyOtp = async (req, res) => {
  try {
    const { email, purpose, otp } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !['register', 'login'].includes(purpose) || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Please provide valid email, purpose, and otp'
      });
    }

    const record = await AuthOtp.findOne({ email: normalizedEmail, purpose });
    if (!record || record.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'OTP expired. Please request a new OTP'
      });
    }

    if (record.attempts >= 5) {
      return res.status(429).json({
        success: false,
        message: 'Too many invalid attempts. Please request a new OTP'
      });
    }

    if (record.codeHash !== hashOtpCode(otp)) {
      record.attempts += 1;
      await record.save();
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP'
      });
    }

    record.verifiedAt = new Date();
    await record.save();

    const otpToken = jwt.sign(
      { type: 'auth_otp', email: normalizedEmail, purpose },
      process.env.JWT_SECRET,
      { expiresIn: `${otpExpiryMinutes}m` }
    );

    res.status(200).json({
      success: true,
      message: 'OTP verified',
      data: { otpToken }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Google login (ready endpoint)
// @route   POST /api/auth/google
// @access  Public
exports.googleLogin = async (req, res) => {
  try {
    if (process.env.GOOGLE_LOGIN_ENABLED !== 'true') {
      return res.status(400).json({
        success: false,
        message: 'Google login is disabled'
      });
    }

    const { email, name, googleId, schoolName } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !googleId || !name) {
      return res.status(400).json({
        success: false,
        message: 'Google login payload is incomplete'
      });
    }

    let user = await User.findOne({ email: normalizedEmail }).populate('schoolId');

    if (user && user.authProvider === 'local') {
      return res.status(400).json({
        success: false,
        message: 'This email is registered with password login. Use email/password.'
      });
    }

    if (!user) {
      user = await User.create({
        name,
        email: normalizedEmail,
        role: 'school_owner',
        authProvider: 'google',
        googleId,
        isEmailVerified: true
      });

      const school = await School.create({
        name: schoolName || `${name}'s Workspace`,
        owner: user._id
      });

      user.schoolId = school._id;
      await user.save();
      user = await User.findById(user._id).populate('schoolId');
    } else if (!user.schoolId) {
      const school = await School.create({
        name: schoolName || `${name}'s Workspace`,
        owner: user._id
      });
      user.schoolId = school._id;
      user.googleId = user.googleId || googleId;
      await user.save();
      user = await User.findById(user._id).populate('schoolId');
    } else {
      user.googleId = user.googleId || googleId;
      user.lastLogin = new Date();
      await user.save();
    }

    sendTokenResponse(user, 200, res);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Facebook app deauthorization callback
// @route   POST /api/auth/deauthorize
// @access  Public callback
exports.facebookDeauthorize = async (req, res) => {
  try {
    const payload = parseFacebookSignedRequest(req.body?.signed_request);

    res.status(200).json({
      success: true,
      message: 'Deauthorization received',
      data: {
        userId: payload?.user_id || null
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Facebook data deletion request callback
// @route   POST /api/auth/data-deletion
// @access  Public callback
exports.facebookDataDeletion = async (req, res) => {
  try {
    const payload = parseFacebookSignedRequest(req.body?.signed_request);
    const confirmationCode = `fb-delete-${payload?.user_id || 'request'}-${Date.now()}`;

    res.status(200).json({
      url: `${getAppBaseUrl(req)}/api/auth/data-deletion/status/${confirmationCode}`,
      confirmation_code: confirmationCode
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Facebook data deletion request status
// @route   GET /api/auth/data-deletion/status/:code
// @access  Public
exports.facebookDataDeletionStatus = async (req, res) => {
  res.status(200).json({
    success: true,
    status: 'completed',
    confirmation_code: req.params.code
  });
};
