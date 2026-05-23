const express = require('express');
const router = express.Router();
const { 
  sendMessage, 
  sendTemplateMessage, 
  getMessageStatus,
  getConfig,
  startOnboarding,
  connectConfiguredAccount,
  handleOnboardingCallback
} = require('../controllers/whatsappController');
const { protect, attachSchoolId, checkSubscription } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

router.get('/onboarding/callback', asyncHandler(handleOnboardingCallback));
router.post('/onboarding/callback', asyncHandler(handleOnboardingCallback));

router.use(asyncHandler(protect));
router.use(attachSchoolId);

router.post('/onboarding/start', asyncHandler(startOnboarding));
router.post('/connect-configured', asyncHandler(connectConfiguredAccount));
router.get('/config', asyncHandler(getConfig));
router.use(checkSubscription('basic'));
router.post('/send', asyncHandler(sendMessage));
router.post('/send-template', asyncHandler(sendTemplateMessage));
router.get('/status/:messageId', asyncHandler(getMessageStatus));

module.exports = router;
