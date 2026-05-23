const express = require('express');
const router = express.Router();
const { 
  getRules, 
  getRule, 
  createRule, 
  updateRule, 
  deleteRule,
  toggleRule,
  getAnalytics,
  testChatbot,
  createStarterKit
} = require('../controllers/chatbotController');
const { protect, attachSchoolId, checkSubscription } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

router.use(asyncHandler(protect));
router.use(attachSchoolId);
router.use(checkSubscription('basic'));

router.get('/analytics', asyncHandler(getAnalytics));
router.post('/test', asyncHandler(testChatbot));
router.post('/starter-kit', asyncHandler(createStarterKit));
router.get('/rules', asyncHandler(getRules));
router.get('/rules/:id', asyncHandler(getRule));
router.post('/rules', asyncHandler(createRule));
router.put('/rules/:id', asyncHandler(updateRule));
router.delete('/rules/:id', asyncHandler(deleteRule));
router.patch('/rules/:id/toggle', asyncHandler(toggleRule));

module.exports = router;
