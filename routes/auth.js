const express = require('express');
const router = express.Router();
const { 
  register, 
  login, 
  requestOtp,
  verifyOtp,
  googleLogin,
  getMe, 
  updateProfile, 
  updatePassword,
  adminLogin,
  facebookDeauthorize,
  facebookDataDeletion,
  facebookDataDeletionStatus
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

router.post('/register', asyncHandler(register));
router.post('/login', asyncHandler(login));
router.post('/otp/request', asyncHandler(requestOtp));
router.post('/otp/verify', asyncHandler(verifyOtp));
router.post('/google', asyncHandler(googleLogin));
router.post('/admin-login', asyncHandler(adminLogin));
router.post('/deauthorize', asyncHandler(facebookDeauthorize));
router.post('/data-deletion', asyncHandler(facebookDataDeletion));
router.get('/data-deletion/status/:code', asyncHandler(facebookDataDeletionStatus));
router.get('/me', asyncHandler(protect), asyncHandler(getMe));
router.put('/profile', asyncHandler(protect), asyncHandler(updateProfile));
router.put('/password', asyncHandler(protect), asyncHandler(updatePassword));

module.exports = router;
