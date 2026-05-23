const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const {
  getTemplates,
  createTemplate,
  uploadTemplateImage,
  updateTemplate,
  submitTemplate,
  syncTemplates,
  syncTemplate,
  deleteTemplate
} = require('../controllers/templateController');
const { protect, attachSchoolId, checkSubscription } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const templateDir = path.join(__dirname, '..', 'uploads', 'templates');
fs.mkdirSync(templateDir, { recursive: true });

const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, templateDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.schoolId}-${Date.now()}${ext}`);
  }
});

const mediaUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isAllowed = file.mimetype.startsWith('image/')
      || file.mimetype.startsWith('video/')
      || [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      ].includes(file.mimetype);

    if (!isAllowed) {
      return cb(new Error('Only image, video, or document files are allowed'));
    }
    cb(null, true);
  }
});

router.use(asyncHandler(protect));
router.use(attachSchoolId);
router.use(checkSubscription('basic'));

router.get('/', asyncHandler(getTemplates));
router.post('/upload-image', mediaUpload.single('image'), asyncHandler(uploadTemplateImage));
router.post('/sync', asyncHandler(syncTemplates));
router.post('/', asyncHandler(createTemplate));
router.put('/:id', asyncHandler(updateTemplate));
router.post('/:id/submit', asyncHandler(submitTemplate));
router.post('/:id/sync', asyncHandler(syncTemplate));
router.delete('/:id', asyncHandler(deleteTemplate));

module.exports = router;
