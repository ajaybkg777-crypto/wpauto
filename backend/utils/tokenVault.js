const crypto = require('crypto');

const PREFIX = 'enc:v1:';

const getEncryptionKey = () => {
  const source = process.env.TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!source) {
    throw new Error('TOKEN_ENCRYPTION_KEY or JWT_SECRET is required for token encryption');
  }

  return crypto.createHash('sha256').update(source).digest();
};

const encryptSecret = (value) => {
  if (!value || String(value).startsWith(PREFIX)) return value;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(String(value), 'utf8'),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
};

const decryptSecret = (value) => {
  if (!value || !String(value).startsWith(PREFIX)) return value;

  const parts = String(value).slice(PREFIX.length).split(':');
  const [ivBase64, tagBase64, encryptedBase64] = parts;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(ivBase64, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, 'base64')),
    decipher.final()
  ]).toString('utf8');
};

module.exports = {
  encryptSecret,
  decryptSecret
};
