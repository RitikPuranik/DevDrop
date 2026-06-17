const multer = require('multer');
const path = require('path');

// File filter function
const fileFilter = (allowedTypes) => {
  return (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`), false);
    }
  };
};

// Multer configuration for different file types
const storage = multer.memoryStorage(); // Store in memory for direct upload to Supabase

// ZIP file upload (source code)
const uploadZip = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE_ZIP) || 100 * 1024 * 1024, // 100MB
  },
  fileFilter: fileFilter(['.zip']),
});

// PDF file upload (documentation)
const uploadPdf = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE_PDF) || 10 * 1024 * 1024, // 10MB
  },
  fileFilter: fileFilter(['.pdf']),
});

// Video file upload
const uploadVideo = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE_VIDEO) || 500 * 1024 * 1024, // 500MB
  },
  fileFilter: fileFilter(['.mp4', '.webm', '.mov', '.avi']),
});

// Avatar image upload (profile picture)
const uploadAvatar = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE_AVATAR) || 5 * 1024 * 1024, // 5MB
  },
  fileFilter: fileFilter(['.jpg', '.jpeg', '.png', '.webp']),
});

// Multiple files upload (for admin approval)
const uploadMultiple = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE_VIDEO) || 500 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = ['.zip', '.pdf', '.mp4', '.webm', '.mov', '.avi'];
    
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${ext}`), false);
    }
  },
});

// Error handler for multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size exceeds limit.',
      });
    }
    
    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`,
    });
  }
  
  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
  
  next();
};

module.exports = {
  uploadZip,
  uploadPdf,
  uploadVideo,
  uploadAvatar,
  uploadMultiple,
  handleMulterError,
};