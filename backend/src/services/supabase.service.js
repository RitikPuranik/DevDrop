const supabase = require('../shared/config/supabase');
const { SUPABASE_BUCKET, SUPABASE_FOLDERS, SIGNED_URL_EXPIRY } = require('../shared/utils/constants');
const { generateFileName, createSupabasePath } = require('../shared/utils/helpers');

const uploadFile = async (file, folder, customFileName = null) => {
  try {
    const fileName = customFileName || generateFileName(file.originalname, `${folder}-`);
    const filePath = createSupabasePath(folder, fileName);

    const { data, error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(filePath, file.buffer, { contentType: file.mimetype, cacheControl: '3600', upsert: false });

    if (error) throw new Error(`Supabase upload error: ${error.message}`);
    return { path: data.path, fileName, size: file.size, uploadedAt: new Date() };
  } catch (error) {
    console.error('Upload file error:', error);
    throw error;
  }
};

const getPublicUrl = (filePath) => {
  const { data } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
};

const createSignedUrl = async (filePath, expiresIn = SIGNED_URL_EXPIRY) => {
  const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).createSignedUrl(filePath, expiresIn);
  if (error) throw new Error(`Signed URL error: ${error.message}`);
  return data.signedUrl;
};

const createSignedUrls = async (filePaths, expiresIn = SIGNED_URL_EXPIRY) => {
  const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).createSignedUrls(filePaths, expiresIn);
  if (error) throw new Error(`Signed URLs error: ${error.message}`);
  return data;
};

const deleteFile = async (filePath) => {
  const { error } = await supabase.storage.from(SUPABASE_BUCKET).remove([filePath]);
  if (error) throw new Error(`Delete file error: ${error.message}`);
  return true;
};

const deleteFiles = async (filePaths) => {
  const { error } = await supabase.storage.from(SUPABASE_BUCKET).remove(filePaths);
  if (error) throw new Error(`Delete files error: ${error.message}`);
  return true;
};

const uploadSourceCode   = async (file) => uploadFile(file, SUPABASE_FOLDERS.SOURCE_CODE);
const uploadDocs         = async (file) => uploadFile(file, SUPABASE_FOLDERS.DOCS);
const uploadVideo        = async (file) => uploadFile(file, SUPABASE_FOLDERS.VIDEOS);
const uploadPreviewVideo = async (file) => {
  const result = await uploadFile(file, SUPABASE_FOLDERS.PREVIEW_VIDEOS);
  result.publicUrl = getPublicUrl(result.path);
  return result;
};

const deleteWebsiteFiles = async (website) => {
  const filePaths = [website.sourceCodeUrl, website.docsUrl, website.videoUrl, website.previewVideoUrl].filter(Boolean);
  if (filePaths.length > 0) return deleteFiles(filePaths);
  return true;
};

module.exports = { uploadFile, getPublicUrl, createSignedUrl, createSignedUrls, deleteFile, deleteFiles, uploadSourceCode, uploadDocs, uploadVideo, uploadPreviewVideo, deleteWebsiteFiles };
