const jwt = require('jsonwebtoken');
const User = require('../models/User');
const School = require('../models/School');

// Protect routes - verify JWT token
exports.protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    req.user = await User.findById(decoded.id).populate('schoolId');
    
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!req.user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User account is deactivated'
      });
    }

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  }
};

// Authorize specific roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to perform this action'
      });
    }
    next();
  };
};

// School owner middleware
exports.schoolOwner = (req, res, next) => {
  if (req.user.role !== 'school_owner' && req.user.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      message: 'Only school owners can access this resource'
    });
  }
  next();
};

// Super admin middleware
exports.superAdmin = (req, res, next) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      message: 'Only super admins can access this resource'
    });
  }
  next();
};

// Check school subscription
exports.checkSubscription = (requiredPlan = 'basic') => {
  return (req, res, next) => {
    if (process.env.SUBSCRIPTION_ENABLED === 'false') {
      return next();
    }

    if (req.user.role === 'super_admin') {
      return next();
    }

    const school = req.user.schoolId;
    
    if (!school) {
      return res.status(403).json({
        success: false,
        message: 'School not found'
      });
    }

    const planHierarchy = ['free', 'basic', 'pro', 'advanced'];
    const userPlanIndex = planHierarchy.indexOf(school.subscription.plan);
    const requiredPlanIndex = planHierarchy.indexOf(requiredPlan);

    if (userPlanIndex < requiredPlanIndex) {
      return res.status(403).json({
        success: false,
        message: `This feature requires ${requiredPlan} plan or higher`
      });
    }

    if (school.subscription.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Your subscription is not active'
      });
    }

    if (school.subscription.endDate && new Date(school.subscription.endDate) < new Date()) {
      return res.status(403).json({
        success: false,
        message: 'Your subscription has expired'
      });
    }

    next();
  };
};

// Generate JWT token
exports.generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

// Attach schoolId to request
exports.attachSchoolId = (req, res, next) => {
  if (req.user.role === 'super_admin') {
    // Super admin can access any school
    req.schoolId = req.body.schoolId || req.query.schoolId || req.user.schoolId?._id;
  } else {
    // School owner can only access their own school
    req.schoolId = req.user.schoolId._id;
  }
  next();
};
