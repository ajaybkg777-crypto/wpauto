const express = require('express');
const router = express.Router();
const { 
  receiveWhatsAppMessage,
  verifyWebhook 
} = require('../controllers/webhookController');
const { asyncHandler } = require('../middleware/errorHandler');

const verify = asyncHandler(verifyWebhook);
const receive = asyncHandler(receiveWhatsAppMessage);

// Public webhook endpoints (no auth required)
router.get('/', verify);
router.post('/', receive);
router.get('/meta', verify);
router.post('/meta', receive);
router.get('/whatsapp', verify);
router.post('/whatsapp', receive);

module.exports = router;
