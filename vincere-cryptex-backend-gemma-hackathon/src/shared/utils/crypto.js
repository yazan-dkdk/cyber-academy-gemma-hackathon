import crypto from 'crypto';
import { env } from '../../config/env.js';

const algorithm = 'aes-256-gcm';

const getKeyBuffer = () => {
  const key = env.mfaEncryptionKey.trim();
  if (key.length !== 64) {
    throw new Error('MFA_ENCRYPTION_KEY must be a 64-character hex string');
  }

  return Buffer.from(key, 'hex');
};

export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export const encrypt = (value) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, getKeyBuffer(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64')
  };
};

export const decrypt = ({ ciphertext, iv, tag }) => {
  const decipher = crypto.createDecipheriv(
    algorithm,
    getKeyBuffer(),
    Buffer.from(iv, 'base64')
  );

  decipher.setAuthTag(Buffer.from(tag, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
};
