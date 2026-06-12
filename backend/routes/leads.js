const express = require('express');
const router = express.Router();
const { 
  getLeads, 
  getLead, 
  createLead, 
  updateLead, 
  deleteLead,
  bulkDeleteLeads,
  addConversation,
  importLeads,
  exportLeads,
  getLeadStats
} = require('../controllers/leadController');
const { protect, attachSchoolId, checkSubscription } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

router.use(asyncHandler(protect));
router.use(attachSchoolId);
router.use(checkSubscription('basic'));

router.get('/export', asyncHandler(exportLeads));
router.get('/stats', asyncHandler(getLeadStats));
router.post('/import', asyncHandler(importLeads));
router.delete('/bulk', asyncHandler(bulkDeleteLeads));
router.get('/', asyncHandler(getLeads));
router.get('/:id', asyncHandler(getLead));
router.post('/', asyncHandler(createLead));
router.put('/:id', asyncHandler(updateLead));
router.delete('/:id', asyncHandler(deleteLead));
router.post('/:id/conversation', asyncHandler(addConversation));

module.exports = router;
