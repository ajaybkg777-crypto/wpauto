const express = require('express');
const router = express.Router();
const { getInbox, getConversation, sendChatMessage } = require('../controllers/chatController');
const { protect, attachSchoolId, checkSubscription } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

router.use(asyncHandler(protect));
router.use(attachSchoolId);
router.use(checkSubscription('basic'));

router.get('/inbox', asyncHandler(getInbox));
router.get('/:leadId', asyncHandler(getConversation));
router.post('/:leadId/send', asyncHandler(sendChatMessage));

module.exports = router;
