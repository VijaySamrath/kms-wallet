import * as crypto from 'crypto';
import { MemoryCleaner } from '../utils/MemoryCleaner';

export interface EncryptedData {
  encryptedData: string;
  iv: string;
  authTag: string;
  algorithm: 'AES-256-GCM';
}

export class CryptoService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 12;
  private static readonly AUTH_TAG_LENGTH = 16;

  static encrypt(plaintext: string, key: Buffer): EncryptedData {
    try {
      const iv = crypto.randomBytes(this.IV_LENGTH);
      const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv, {
        authTagLength: this.AUTH_TAG_LENGTH
      });

      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag();

      return {
        encryptedData: encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        algorithm: 'AES-256-GCM'
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Encryption failed';
      throw new Error(`Encryption error: ${message}`);
    }
  }

  static decrypt(encryptedData: string, key: Buffer, iv: string, authTag: string): string {
    try {
      const ivBuffer = Buffer.from(iv, 'hex');
      const authTagBuffer = Buffer.from(authTag, 'hex');

      const decipher = crypto.createDecipheriv(this.ALGORITHM, key, ivBuffer, {
        authTagLength: this.AUTH_TAG_LENGTH
      });

      decipher.setAuthTag(authTagBuffer);

      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Decryption failed';
      throw new Error(`Decryption error: ${message}`);
    }
  }

  static generateKey(): Buffer {
    return crypto.randomBytes(32);
  }

  static hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
  }

  static verifyPassword(password: string, storedHash: string): boolean {
    const [salt, hash] = storedHash.split(':');
    const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return hash === verifyHash;
  }
}