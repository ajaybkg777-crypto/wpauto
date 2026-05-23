const express = require('express');
const {
  getFlows,
  getFlowSubmissions,
  createFlow,
  updateFlow,
  previewFlow,
  submitFlow,
  sendFlowMessage,
  deleteFlow
} = require('../controllers/flowController');
const { protect, attachSchoolId, checkSubscription } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

router.use(asyncHandler(protect));
router.use(attachSchoolId);
router.use(checkSubscription('basic'));

router.get('/', asyncHandler(getFlows));
router.get('/submissions', asyncHandler(getFlowSubmissions));
router.post('/preview', asyncHandler(previewFlow));
router.post('/', asyncHandler(createFlow));
router.put('/:id', asyncHandler(updateFlow));
router.post('/:id/submit', asyncHandler(submitFlow));
router.post('/:id/send', asyncHandler(sendFlowMessage));
router.get('/:id/submissions', asyncHandler(getFlowSubmissions));
router.delete('/:id', asyncHandler(deleteFlow));

module.exports = router;
