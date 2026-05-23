const express = require('express');
const router = express.Router();
const { 
  getPlans, 
  getCurrentSubscription, 
  createOrder, 
  verifyPayment, 
  cancelSubscription,
  getInvoices,
  seedPlans
} = require('../controllers/subscriptionController');
const { protect, attachSchoolId, superAdmin } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

// Public routes
router.get('/plans', asyncHandler(getPlans));

// Protected routes
router.use(asyncHandler(protect));
router.use(attachSchoolId);

router.get('/current', asyncHandler(getCurrentSubscription));
router.post('/create-order', asyncHandler(createOrder));
router.post('/verify', asyncHandler(verifyPayment));
router.post('/cancel', asyncHandler(cancelSubscription));
router.get('/invoices', asyncHandler(getInvoices));

// Super admin routes
router.post('/seed-plans', superAdmin, asyncHandler(seedPlans));

module.exports = router;