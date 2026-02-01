const supabase = require('../config/supabase');
const { 
  SUPABASE_BUCKET, 
  SUPABASE_FOLDERS, 
  SIGNED_URL_EXPIRY 
} = require('../utils/constants');
const { generateFileName, createSupabasePath } = require('../utils/helpers');

/**
 * Upload file to Supabase Storage
 */
const uploadFile = async (file, folder, customFileName = null) => {
  try {
    const fileName = customFileName || generateFileName(file.originalname, `${folder}-`);
    const filePath = createSupabasePath(folder, fileName);

    const { data, error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      throw new Error(`Supabase upload error: ${error.message}`);
    }

    return {
      path: data.path,
      fileName,
      size: file.size,
      uploadedAt: new Date(),
    };
  } catch (error) {
    console.error('Upload file error:', error);
    throw error;
  }
};

/**
 * Get public URL for a file
 */
const getPublicUrl = (filePath) => {
  const { data } = supabase.storage
    .from(SUPABASE_BUCKET)
    .getPublicUrl(filePath);

  return data.publicUrl;
};

/**
 * Create signed URL for private file access
 */
const createSignedUrl = async (filePath, expiresIn = SIGNED_URL_EXPIRY) => {
  try {
    const { data, error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .createSignedUrl(filePath, expiresIn);

    if (error) {
      throw new Error(`Signed URL error: ${error.message}`);
    }

    return data.signedUrl;
  } catch (error) {
    console.error('Create signed URL error:', error);
    throw error;
  }
};

/**
 * Create signed URLs for multiple files
 */
const createSignedUrls = async (filePaths, expiresIn = SIGNED_URL_EXPIRY) => {
  try {
    const { data, error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .createSignedUrls(filePaths, expiresIn);

    if (error) {
      throw new Error(`Signed URLs error: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('Create signed URLs error:', error);
    throw error;
  }
};

/**
 * Delete file from Supabase Storage
 */
const deleteFile = async (filePath) => {
  try {
    const { error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .remove([filePath]);

    if (error) {
      throw new Error(`Delete file error: ${error.message}`);
    }

    return true;
  } catch (error) {
    console.error('Delete file error:', error);
    throw error;
  }
};

/**
 * Delete multiple files
 */
const deleteFiles = async (filePaths) => {
  try {
    const { error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .remove(filePaths);

    if (error) {
      throw new Error(`Delete files error: ${error.message}`);
    }

    return true;
  } catch (error) {
    console.error('Delete files error:', error);
    throw error;
  }
};

/**
 * Download file from Supabase Storage
 */
const downloadFile = async (filePath) => {
  try {
    const { data, error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .download(filePath);

    if (error) {
      throw new Error(`Download error: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('Download file error:', error);
    throw error;
  }
};

/**
 * Upload source code ZIP
 */
const uploadSourceCode = async (file) => {
  return uploadFile(file, SUPABASE_FOLDERS.SOURCE_CODE);
};

/**
 * Upload documentation PDF
 */
const uploadDocs = async (file) => {
  return uploadFile(file, SUPABASE_FOLDERS.DOCS);
};

/**
 * Upload video
 */
const uploadVideo = async (file) => {
  return uploadFile(file, SUPABASE_FOLDERS.VIDEOS);
};

/**
 * Upload preview video (public)
 */
const uploadPreviewVideo = async (file) => {
  const result = await uploadFile(file, SUPABASE_FOLDERS.PREVIEW_VIDEOS);
  // Make preview videos public
  result.publicUrl = getPublicUrl(result.path);
  return result;
};

/**
 * Delete website files (cascade delete)
 */
const deleteWebsiteFiles = async (website) => {
  const filePaths = [];

  if (website.sourceCodeUrl) {
    filePaths.push(website.sourceCodeUrl);
  }
  if (website.docsUrl) {
    filePaths.push(website.docsUrl);
  }
  if (website.videoUrl) {
    filePaths.push(website.videoUrl);
  }
  if (website.previewVideoUrl) {
    filePaths.push(website.previewVideoUrl);
  }

  if (filePaths.length > 0) {
    return deleteFiles(filePaths);
  }

  return true;
};

module.exports = {
  uploadFile,
  getPublicUrl,
  createSignedUrl,
  createSignedUrls,
  deleteFile,
  deleteFiles,
  downloadFile,
  uploadSourceCode,
  uploadDocs,
  uploadVideo,
  uploadPreviewVideo,
  deleteWebsiteFiles,
};