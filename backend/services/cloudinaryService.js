const crypto = require('crypto');
const fs = require('fs/promises');

const isCloudinaryConfigured = () => Boolean(
  process.env.CLOUDINARY_CLOUD_NAME
    && process.env.CLOUDINARY_API_KEY
    && process.env.CLOUDINARY_API_SECRET
);

const getResourceType = (mimetype = '') => {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  return 'raw';
};

const signParams = (params) => {
  const payload = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');

  return crypto
    .createHash('sha1')
    .update(`${payload}${process.env.CLOUDINARY_API_SECRET}`)
    .digest('hex');
};

const uploadFileToCloudinary = async (file, options = {}) => {
  if (!isCloudinaryConfigured()) return null;
  if (!file?.path) throw new Error('Cloudinary upload needs a local file path');

  const resourceType = options.resourceType || getResourceType(file.mimetype);
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    timestamp,
    folder: options.folder || 'waauto',
    public_id: options.publicId
  };

  const form = new FormData();
  const buffer = await fs.readFile(file.path);
  const blob = new Blob([buffer], { type: file.mimetype || 'application/octet-stream' });

  form.append('file', blob, file.originalname || file.filename || 'upload');
  form.append('api_key', process.env.CLOUDINARY_API_KEY);
  form.append('timestamp', String(timestamp));
  form.append('folder', params.folder);
  if (params.public_id) form.append('public_id', params.public_id);
  form.append('signature', signParams(params));

  const url = `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`;
  const response = await fetch(url, {
    method: 'POST',
    body: form
  });
  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error?.message || 'Cloudinary upload failed');
  }

  return {
    url: data.secure_url,
    publicId: data.public_id,
    resourceType: data.resource_type,
    format: data.format,
    bytes: data.bytes
  };
};

module.exports = {
  isCloudinaryConfigured,
  uploadFileToCloudinary
};
