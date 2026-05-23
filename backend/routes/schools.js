const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { 
  getProfile, 
  updateProfile, 
  uploadLogo,
  getStats,
  getMainFlowStatus,
  configureWhatsApp,
  getWhatsAppStatus,
  disconnectWhatsApp,
  getAllSchools,
  getSchool,
  updateSchool,
  deleteSchool
} = require('../controllers/schoolController');
const { protect, authorize, superAdmin, attachSchoolId } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const logoDir = path.join(__dirname, '..', 'uploads', 'logos');
fs.mkdirSync(logoDir, { recursive: true });

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, logoDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.schoolId}-${Date.now()}${ext}`);
  }
});

const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  }
});

// School owner routes
router.use(asyncHandler(protect));
router.use(attachSchoolId);

router.get('/profile', asyncHandler(getProfile));
router.put('/profile', asyncHandler(updateProfile));
router.post('/logo', logoUpload.single('logo'), asyncHandler(uploadLogo));
router.get('/stats', asyncHandler(getStats));
router.get('/main-flow', asyncHandler(getMainFlowStatus));
router.put('/whatsapp', asyncHandler(configureWhatsApp));
router.get('/whatsapp/status', asyncHandler(getWhatsAppStatus));
router.delete('/whatsapp', asyncHandler(disconnectWhatsApp));

// Super admin routes
router.get('/', superAdmin, asyncHandler(getAllSchools));
router.get('/:id', superAdmin, asyncHandler(getSchool));
router.put('/:id', superAdmin, asyncHandler(updateSchool));
router.delete('/:id', superAdmin, asyncHandler(deleteSchool));

module.exports = router;
