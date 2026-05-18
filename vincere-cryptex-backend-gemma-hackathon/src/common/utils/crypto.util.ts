import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
}

export const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');

export const encryptSecret = (plaintext: string, hexKey: string): EncryptedSecret => {
  const key = Buffer.from(hexKey, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
};

export const decryptSecret = (secret: EncryptedSecret, hexKey: string): string => {
  const key = Buffer.from(hexKey, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(secret.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(secret.tag, 'base64'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, 'base64')),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
};

export const timingSafeHexComparison = (leftHex: string, rightHex: string) => {
  const left = Buffer.from(leftHex, 'hex');
  const right = Buffer.from(rightHex, 'hex');

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
};
