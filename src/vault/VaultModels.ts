export interface VaultWallet {
  walletId: string;
  userId: string;
  publicAddress: string;
  encryptedPrivateKey: string;
  encryptedDataKey: string;
  iv: string;
  authTag: string;
  keyVersion?: string;
  createdAt: string;
  lastAccessed?: string;
  metadata?: Record<string, any>;
}

export interface VaultUser {
  userId: string;
  email: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
  lastLogin?: string;
  wallets: string[]; // Array of wallet IDs
  settings?: Record<string, any>;
}

export interface VaultSecret {
  name: string;
  value: string;
  versionId?: string;
  versionStage?: string;
  createdAt?: Date;
  lastAccessed?: Date;
}

export enum VaultPath {
  USERS = 'users',
  WALLETS = 'wallets',
  CONFIG = 'config',
  AUDIT = 'audit'
}