const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const School = require('../models/School');
const Razorpay = require('razorpay');

let razorpayClient;

const getRazorpayClient = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay keys are not configured');
  }

  if (!razorpayClient) {
    razorpayClient = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
  }

  return razorpayClient;
};

const SCHOOL_PLAN = {
  name: 'basic',
  displayName: 'School Plan',
  description: 'Required monthly plan for schools and coaching centers',
  monthlyPrice: 999,
  yearlyPrice: 11988,
  features: {
    maxLeads: Number(process.env.LIMIT_CONTACTS_BASIC || 2000),
    maxMessagesPerDay: 200,
    maxBroadcasts: 20,
    chatbotEnabled: true,
    analyticsEnabled: true,
    automationEnabled: true,
    prioritySupport: false,
    customBranding: false,
    apiAccess: false
  },
  limits: {
    maxUsers: 2,
    maxContacts: Number(process.env.LIMIT_CONTACTS_BASIC || 2000),
    maxTemplates: 10
  },
  isActive: true,
  sortOrder: 1
};

const ensureSchoolPlan = async () => {
  return Plan.findOneAndUpdate(
    { name: 'basic' },
    SCHOOL_PLAN,
    { upsert: true, new: true }
  );
};

// @desc    Get all plans
// @route   GET /api/subscription/plans
// @access  Public
exports.getPlans = async (req, res) => {
  try {
    await ensureSchoolPlan();
    const plans = await Plan.find({ isActive: true, name: 'basic' }).sort({ sortOrder: 1 });

    res.status(200).json({
      success: true,
      count: plans.length,
      data: plans
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get current subscription
// @route   GET /api/subscription/current
// @access  Private
exports.getCurrentSubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ schoolId: req.schoolId })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: subscription
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Create subscription order
// @route   POST /api/subscription/create-order
// @access  Private
exports.createOrder = async (req, res) => {
  try {
    const { plan, billingCycle } = req.body;

    if (plan !== 'basic') {
      return res.status(400).json({
        success: false,
        message: 'Only the ₹999/month school plan is available'
      });
    }

    // Get plan details
    const planDoc = await ensureSchoolPlan();
    
    if (!planDoc) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }

    const amount = billingCycle === 'yearly' 
      ? planDoc.yearlyPrice * 100 
      : planDoc.monthlyPrice * 100;

    const isDevPayment = process.env.NODE_ENV !== 'production';
    const order = isDevPayment
      ? {
          id: `order_sim_${Date.now()}`,
          amount,
          currency: 'INR'
        }
      : await getRazorpayClient().orders.create({
          amount,
          currency: 'INR',
          receipt: `receipt_${Date.now()}`,
          notes: {
            schoolId: req.schoolId.toString(),
            plan,
            billingCycle
          }
        });

    res.status(200).json({
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Verify payment and activate subscription
// @route   POST /api/subscription/verify
// @access  Private
exports.verifyPayment = async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, plan, billingCycle = 'monthly' } = req.body;

    if (plan !== 'basic') {
      return res.status(400).json({
        success: false,
        message: 'Only the ₹999/month school plan is available'
      });
    }

    // Verify signature
    const crypto = require('crypto');
    const body = razorpayOrderId + '|' + razorpayPaymentId;
    if (!process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({
        success: false,
        message: 'Razorpay keys are not configured'
      });
    }

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    const isSimulatedPayment = process.env.NODE_ENV !== 'production' && razorpaySignature === 'simulated_signature';

    if (!isSimulatedPayment && expectedSignature !== razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: 'Invalid signature'
      });
    }

    // Get plan details
    const planDoc = await ensureSchoolPlan();
    
    if (!planDoc) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }

    // Calculate subscription period
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + (billingCycle === 'yearly' ? 12 : 1));

    // Create subscription record
    const subscription = await Subscription.create({
      schoolId: req.schoolId,
      plan,
      razorpayOrderId,
      razorpayPaymentId,
      status: 'active',
      startDate,
      endDate,
      amount: billingCycle === 'yearly' ? planDoc.yearlyPrice : planDoc.monthlyPrice,
      billingCycle,
      features: planDoc.features,
      lastPaymentDate: new Date(),
      nextPaymentDate: endDate
    });

    // Update school subscription
    await School.findByIdAndUpdate(req.schoolId, {
      subscription: {
        plan,
        status: 'active',
        startDate,
        endDate,
        razorpaySubscriptionId: subscription._id
      },
      limits: {
        maxLeads: planDoc.features.maxLeads,
        maxMessagesPerDay: planDoc.features.maxMessagesPerDay,
        maxBroadcasts: planDoc.features.maxBroadcasts
      }
    });

    res.status(200).json({
      success: true,
      message: 'Subscription activated',
      data: subscription
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Cancel subscription
// @route   POST /api/subscription/cancel
// @access  Private
exports.cancelSubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ 
      schoolId: req.schoolId,
      status: 'active'
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found'
      });
    }

    // Update subscription status
    subscription.status = 'cancelled';
    await subscription.save();

    // Downgrade school to locked free plan
    await School.findByIdAndUpdate(req.schoolId, {
      'subscription.status': 'inactive',
      'subscription.plan': 'free',
      limits: {
        maxLeads: 0,
        maxMessagesPerDay: 0,
        maxBroadcasts: 0
      }
    });

    res.status(200).json({
      success: true,
      message: 'Subscription cancelled'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get subscription invoices
// @route   GET /api/subscription/invoices
// @access  Private
exports.getInvoices = async (req, res) => {
  try {
    const subscriptions = await Subscription.find({ 
      schoolId: req.schoolId 
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: subscriptions.length,
      data: subscriptions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Seed default plans (admin only)
// @route   POST /api/subscription/seed-plans
// @access  Private (Super Admin)
exports.seedPlans = async (req, res) => {
  try {
    const plans = [SCHOOL_PLAN];

    // Upsert plans
    for (const plan of plans) {
      await Plan.findOneAndUpdate(
        { name: plan.name },
        plan,
        { upsert: true, new: true }
      );
    }

    await Plan.updateMany(
      { name: { $ne: 'basic' } },
      { isActive: false }
    );

    res.status(200).json({
      success: true,
      message: 'Plans seeded successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
