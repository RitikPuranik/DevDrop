const multer = require('multer');
const path = require('path');

// Same memory-storage pattern as shared/middleware/uploadValidation.js —
// files go straight to Supabase, never touch local disk (Section 11: no
// arbitrary filesystem writes, no path traversal surface).
const storage = multer.memoryStorage();

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_AI_ASSET, 10) || 8 * 1024 * 1024; // 8MB

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  // Belt-and-suspenders: check both the extension AND the reported
  // MIME type. Neither is fully trustworthy from the client alone, but
  // requiring both to agree with our allow-list closes off most of the
  // "rename a .exe to .jpg" style tricks (Section 11).
  if (!ALLOWED_EXTENSIONS.includes(ext) || !ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error('Unsupported file type. Allowed: JPG, PNG, WEBP, PDF.'), false);
  }
  return cb(null, true);
};

const uploadAiAsset = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
}).single('file');

const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'File exceeds the 8MB size limit.' });
    }
    return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
  }
  if (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next();
};

module.exports = { uploadAiAsset, handleUploadError };
