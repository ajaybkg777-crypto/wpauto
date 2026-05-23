const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { 
  getBroadcasts, 
  getBroadcast, 
  createBroadcast, 
  uploadBroadcastImage,
  updateBroadcast, 
  deleteBroadcast,
  startBroadcast,
  getBroadcastStats
} = require('../controllers/broadcastController');
const { protect, attachSchoolId, checkSubscription } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const broadcastDir = path.join(__dirname, '..', 'uploads', 'broadcasts');
fs.mkdirSync(broadcastDir, { recursive: true });

const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, broadcastDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.schoolId}-${Date.now()}${ext}`);
  }
});

const imageUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  }
});

router.use(asyncHandler(protect));
router.use(attachSchoolId);
router.use(checkSubscription('basic'));

router.get('/stats', asyncHandler(getBroadcastStats));
router.post('/upload-image', imageUpload.single('image'), asyncHandler(uploadBroadcastImage));
router.get('/', asyncHandler(getBroadcasts));
router.get('/:id', asyncHandler(getBroadcast));
router.post('/', asyncHandler(createBroadcast));
router.put('/:id', asyncHandler(updateBroadcast));
router.delete('/:id', asyncHandler(deleteBroadcast));
router.post('/:id/start', asyncHandler(startBroadcast));

module.exports = router;
