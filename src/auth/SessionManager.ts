import * as crypto from 'crypto';
import { MemoryCleaner } from '../utils/MemoryCleaner';
import { CryptoService } from '../core/CryptoService';

export interface SessionWallet {
  walletId: string;
  publicAddress: string;
  encryptedPrivateKey: string;
  iv: string;
  authTag: string;
  expiresAt: Date;
}

export class SessionManager {
  private sessionKey: Buffer;
  private wallets: Map<string, SessionWallet> = new Map();
  private timeoutMinutes: number;
  private cleanupInterval: NodeJS.Timeout;

  constructor(timeoutMinutes: number = 30) {
    this.sessionKey = crypto.randomBytes(32);
    this.timeoutMinutes = timeoutMinutes;
    
    // Clean up expired sessions every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  storeWallet(walletId: string, publicAddress: string, privateKey: string): SessionWallet {
    try {
      // Re-encrypt private key with session key
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', this.sessionKey, iv);
      
      let encrypted = cipher.update(privateKey, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag();

      const sessionWallet: SessionWallet = {
        walletId,
        publicAddress,
        encryptedPrivateKey: encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        expiresAt: new Date(Date.now() + this.timeoutMinutes * 60000)
      };

      this.wallets.set(walletId, sessionWallet);
      
      // Clear original private key
      MemoryCleaner.clearString(privateKey);

      console.log(`✅ Wallet ${walletId} stored in session`);
      return sessionWallet;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to store wallet in session: ${message}`);
    }
  }

  getWallet(walletId: string): { privateKey: string; publicAddress: string } | null {
    try {
      const sessionWallet = this.wallets.get(walletId);
      
      if (!sessionWallet) {
        return null;
      }

      // Check expiration
      if (sessionWallet.expiresAt < new Date()) {
        this.wallets.delete(walletId);
        return null;
      }

      // Decrypt with session key
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        this.sessionKey,
        Buffer.from(sessionWallet.iv, 'hex')
      );
      
      decipher.setAuthTag(Buffer.from(sessionWallet.authTag, 'hex'));
      
      let privateKey = decipher.update(sessionWallet.encryptedPrivateKey, 'hex', 'utf8');
      privateKey += decipher.final('utf8');

      // Update expiration (sliding window)
      sessionWallet.expiresAt = new Date(Date.now() + this.timeoutMinutes * 60000);

      return {
        privateKey,
        publicAddress: sessionWallet.publicAddress
      };
    } catch (error: unknown) {
      console.error('Failed to get wallet from session:', error);
      return null;
    }
  }

  removeWallet(walletId: string): void {
    this.wallets.delete(walletId);
  }

  clear(): void {
    this.wallets.clear();
    MemoryCleaner.clearBuffer(this.sessionKey);
  }

  private cleanup(): void {
    const now = new Date();
    let expiredCount = 0;

    for (const [walletId, wallet] of this.wallets.entries()) {
      if (wallet.expiresAt < now) {
        this.wallets.delete(walletId);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      console.log(`🧹 Cleaned up ${expiredCount} expired session wallets`);
    }
  }

  getStats(): { activeWallets: number; expiresAt: Date[] } {
    return {
      activeWallets: this.wallets.size,
      expiresAt: Array.from(this.wallets.values()).map(w => w.expiresAt)
    };
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.clear();
  }
}