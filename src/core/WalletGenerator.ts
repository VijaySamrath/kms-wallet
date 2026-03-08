import { ethers } from 'ethers';
import { CryptoService } from './CryptoService';
import { KMSManager, DataKey } from './KMSManager';
import { MemoryCleaner } from '../utils/MemoryCleaner';

export interface Wallet {
  id: string;
  publicAddress: string;
  privateKey: string; // Only available during creation
  encryptedPrivateKey: string;
  encryptedDataKey: string;
  iv: string;
  authTag: string;
  keyVersion?: string;
  createdAt: Date;
}

export interface StoredWallet {
  id: string;
  publicAddress: string;
  encryptedPrivateKey: string;
  encryptedDataKey: string;
  iv: string;
  authTag: string;
  keyVersion?: string;
  createdAt: Date;
}

export class WalletGenerator {
  private kms: KMSManager;

  constructor() {
    this.kms = new KMSManager();
  }

  async createWallet(userId: string): Promise<StoredWallet> {
    try {
      console.log(`💰 Creating new wallet for user: ${userId}`);

      // 1. Generate blockchain wallet
      const wallet = ethers.Wallet.createRandom();
      const walletId = `wallet_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      console.log(`   • Address: ${wallet.address}`);
      console.log(`   • Wallet ID: ${walletId}`);

      // 2. Generate data key from KMS
      const dataKey = await this.kms.generateDataKey();

      // 3. Encrypt private key with data key
      const encrypted = CryptoService.encrypt(wallet.privateKey, dataKey.plaintext);

      // 4. Create stored wallet object
      const storedWallet: StoredWallet = {
        id: walletId,
        publicAddress: wallet.address,
        encryptedPrivateKey: encrypted.encryptedData,
        encryptedDataKey: dataKey.ciphertext.toString('base64'),
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        keyVersion: dataKey.keyVersion,
        createdAt: new Date()
      };

      // 5. Clean up sensitive data
      MemoryCleaner.clearBuffer(dataKey.plaintext);
      MemoryCleaner.clearString(wallet.privateKey);

      console.log('✅ Wallet created and encrypted successfully');
      return storedWallet;

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Wallet creation failed: ${message}`);
    }
  }

  async decryptWallet(storedWallet: StoredWallet): Promise<{ privateKey: string; publicAddress: string }> {
    try {
      console.log(`🔓 Decrypting wallet: ${storedWallet.id}`);

      // 1. Decrypt data key with KMS
      const dataKeyBuffer = Buffer.from(storedWallet.encryptedDataKey, 'base64');
      const dataKey = await this.kms.decryptDataKey(dataKeyBuffer);

      // 2. Decrypt private key
      const privateKey = CryptoService.decrypt(
        storedWallet.encryptedPrivateKey,
        dataKey,
        storedWallet.iv,
        storedWallet.authTag
      );

      // 3. Clean up data key
      MemoryCleaner.clearBuffer(dataKey);

      console.log('✅ Wallet decrypted successfully');
      return {
        privateKey,
        publicAddress: storedWallet.publicAddress
      };

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Wallet decryption failed: ${message}`);
    }
  }

  async signTransaction(
    storedWallet: StoredWallet,
    transaction: any
  ): Promise<string> {
    try {
      // Decrypt wallet
      const { privateKey } = await this.decryptWallet(storedWallet);

      // Create wallet instance
      const wallet = new ethers.Wallet(privateKey);

      // Sign transaction
      const signedTx = await wallet.signTransaction(transaction);

      // Clean up
      MemoryCleaner.clearString(privateKey);

      return signedTx;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Transaction signing failed: ${message}`);
    }
  }
}