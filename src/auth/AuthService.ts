import { VaultService } from '../vault/VaultService';
import { SessionManager } from './SessionManager';
import { WalletGenerator, StoredWallet } from '../core/WalletGenerator';
import { CryptoService } from '../core/CryptoService';
import { MemoryCleaner } from '../utils/MemoryCleaner';
import { VaultUser, VaultWallet } from '../vault/VaultModels';

export interface LoginResult {
  success: boolean;
  userId?: string;
  wallets?: Array<{ walletId: string; publicAddress: string }>;
  sessionId?: string;
  error?: string;
}

export interface AuthSession {
  userId: string;
  sessionId: string;
  createdAt: Date;
  lastActivity: Date;
}

export class AuthService {
  private vault: VaultService;
  private walletGen: WalletGenerator;
  private sessions: Map<string, SessionManager> = new Map();
  private activeUsers: Map<string, AuthSession> = new Map();

  constructor() {
    this.vault = new VaultService();
    this.walletGen = new WalletGenerator();
  }

  async register(email: string, password: string): Promise<{ success: boolean; userId?: string; error?: string }> {
    try {
      console.log(`📝 Registering new user: ${email}`);

      // Check if user exists
      const userId = this.generateUserId(email);
      const existingUser = await this.vault.getUser(userId);
      
      if (existingUser) {
        throw new Error('User already exists');
      }

      // Hash password
      const passwordHash = CryptoService.hashPassword(password);

      // Create user record
      const user: VaultUser = {
        userId,
        email,
        passwordHash,
        salt: passwordHash.split(':')[0],
        createdAt: new Date().toISOString(),
        wallets: []
      };

      // Store in Vault
      await this.vault.storeUser(user);

      console.log(`✅ User registered: ${userId}`);
      return { success: true, userId };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      console.error('❌ Registration failed:', message);
      return { success: false, error: message };
    }
  }

  async login(email: string, password: string): Promise<LoginResult> {
    try {
      console.log(`🔐 Login attempt: ${email}`);

      // Get user from Vault
      const userId = this.generateUserId(email);
      const user = await this.vault.getUser(userId);

      if (!user) {
        throw new Error('User not found');
      }

      // Verify password
      const isValid = CryptoService.verifyPassword(password, user.passwordHash);
      if (!isValid) {
        throw new Error('Invalid password');
      }

      // Create session
      const sessionId = this.generateSessionId();
      const sessionManager = new SessionManager(30); // 30 minute timeout
      this.sessions.set(sessionId, sessionManager);

      // Track active user
      this.activeUsers.set(userId, {
        userId,
        sessionId,
        createdAt: new Date(),
        lastActivity: new Date()
      });

      // Get user's wallets from Vault
      const vaultWallets = await this.vault.getUserWallets(userId);
      const sessionWallets = [];

      // Decrypt and store in session
      for (const vaultWallet of vaultWallets) {
        try {
          const { privateKey } = await this.walletGen.decryptWallet({
            id: vaultWallet.walletId,
            publicAddress: vaultWallet.publicAddress,
            encryptedPrivateKey: vaultWallet.encryptedPrivateKey,
            encryptedDataKey: vaultWallet.encryptedDataKey,
            iv: vaultWallet.iv,
            authTag: vaultWallet.authTag,
            keyVersion: vaultWallet.keyVersion,
            createdAt: new Date(vaultWallet.createdAt)
          });

          // Store in session (re-encrypted)
          sessionManager.storeWallet(
            vaultWallet.walletId,
            vaultWallet.publicAddress,
            privateKey
          );

          sessionWallets.push({
            walletId: vaultWallet.walletId,
            publicAddress: vaultWallet.publicAddress
          });

          MemoryCleaner.clearString(privateKey);
        } catch (error) {
          console.error(`⚠️ Failed to decrypt wallet ${vaultWallet.walletId}`);
        }
      }

      console.log(`✅ Login successful: ${userId}`);
      return {
        success: true,
        userId,
        wallets: sessionWallets,
        sessionId
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Login failed';
      console.error('❌ Login failed:', message);
      return { success: false, error: message };
    }
  }

  async createWallet(userId: string, sessionId: string): Promise<{ success: boolean; walletId?: string; publicAddress?: string }> {
    try {
      console.log(`💰 Creating wallet for user: ${userId}`);

      // Verify session
      const sessionManager = this.sessions.get(sessionId);
      if (!sessionManager) {
        throw new Error('Invalid or expired session');
      }

      // Get user
      const user = await this.vault.getUser(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Create wallet
      const storedWallet = await this.walletGen.createWallet(userId);

      // Store in Vault
      const vaultWallet: VaultWallet = {
        walletId: storedWallet.id,
        userId,
        publicAddress: storedWallet.publicAddress,
        encryptedPrivateKey: storedWallet.encryptedPrivateKey,
        encryptedDataKey: storedWallet.encryptedDataKey,
        iv: storedWallet.iv,
        authTag: storedWallet.authTag,
        keyVersion: storedWallet.keyVersion,
        createdAt: storedWallet.createdAt.toISOString()
      };

      await this.vault.storeWallet(userId, vaultWallet);

      // Update user's wallet list
      user.wallets.push(storedWallet.id);
      await this.vault.updateUser(user);

      // Decrypt and store in session
      const { privateKey } = await this.walletGen.decryptWallet(storedWallet);
      sessionManager.storeWallet(storedWallet.id, storedWallet.publicAddress, privateKey);
      MemoryCleaner.clearString(privateKey);

      console.log(`✅ Wallet created: ${storedWallet.id}`);
      return {
        success: true,
        walletId: storedWallet.id,
        publicAddress: storedWallet.publicAddress
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Wallet creation failed';
      console.error('❌ Wallet creation failed:', message);
      return { success: false };
    }
  }

  async signTransaction(
    userId: string,
    sessionId: string,
    walletId: string,
    transaction: any
  ): Promise<{ success: boolean; signedTx?: string; error?: string }> {
    try {
      console.log(`✍️ Signing transaction for wallet: ${walletId}`);

      // Verify session
      const sessionManager = this.sessions.get(sessionId);
      if (!sessionManager) {
        throw new Error('Invalid or expired session');
      }

      // Update last activity
      const userSession = this.activeUsers.get(userId);
      if (userSession) {
        userSession.lastActivity = new Date();
      }

      // Get wallet from session
      const sessionWallet = sessionManager.getWallet(walletId);
      if (!sessionWallet) {
        throw new Error('Wallet not found in session');
      }

      // Sign transaction
      const { ethers } = await import('ethers');
      const wallet = new ethers.Wallet(sessionWallet.privateKey);
      const signedTx = await wallet.signTransaction(transaction);

      // Clean up
      MemoryCleaner.clearString(sessionWallet.privateKey);

      console.log(`✅ Transaction signed successfully`);
      return { success: true, signedTx };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Signing failed';
      console.error('❌ Transaction signing failed:', message);
      return { success: false, error: message };
    }
  }

  async logout(userId: string, sessionId: string): Promise<boolean> {
    try {
      // Remove session
      this.sessions.delete(sessionId);
      this.activeUsers.delete(userId);
      
      console.log(`✅ User logged out: ${userId}`);
      return true;
    } catch (error) {
      console.error('❌ Logout failed:', error);
      return false;
    }
  }

  private generateUserId(email: string): string {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(email).digest('hex').substring(0, 16);
    return `user_${hash}`;
  }

  private generateSessionId(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }

  validateSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  getActiveUsers(): Array<{ userId: string; lastActivity: Date }> {
    return Array.from(this.activeUsers.values()).map(({ userId, lastActivity }) => ({
      userId,
      lastActivity
    }));
  }
}