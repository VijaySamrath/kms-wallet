import {
  SecretsManagerClient,
  GetSecretValueCommand,
  CreateSecretCommand,
  UpdateSecretCommand,
  DeleteSecretCommand,
  ListSecretsCommand,
  ResourceNotFoundException
} from '@aws-sdk/client-secrets-manager';
import { createSecretsManagerClient } from '../config/aws-config';
import { VaultWallet, VaultUser, VaultPath } from './VaultModels';

export class VaultService {
  private client: SecretsManagerClient;
  private prefix: string;

  constructor(prefix: string = 'wallet') {
    this.client = createSecretsManagerClient();
    this.prefix = prefix;
  }

  private getSecretName(path: VaultPath, ...parts: string[]): string {
    return `${this.prefix}/${path}/${parts.join('/')}`;
  }

  async storeWallet(userId: string, wallet: VaultWallet): Promise<string> {
    try {
      const secretName = this.getSecretName(VaultPath.WALLETS, userId, wallet.walletId);
      const secretValue = JSON.stringify(wallet);

      try {
        // Try to get existing secret
        await this.getSecret(secretName);
        
        // Update if exists
        const command = new UpdateSecretCommand({
          SecretId: secretName,
          SecretString: secretValue,
          Description: `Wallet ${wallet.walletId} for user ${userId}`
        });
        await this.client.send(command);
        console.log(`✅ Updated wallet in Vault: ${secretName}`);
      } catch (error) {
        if (error instanceof ResourceNotFoundException) {
          // Create if doesn't exist
          const command = new CreateSecretCommand({
            Name: secretName,
            SecretString: secretValue,
            Description: `Wallet ${wallet.walletId} for user ${userId}`,
            Tags: [
              { Key: 'userId', Value: userId },
              { Key: 'walletId', Value: wallet.walletId },
              { Key: 'type', Value: 'wallet' }
            ]
          });
          await this.client.send(command);
          console.log(`✅ Created new wallet in Vault: ${secretName}`);
        } else {
          throw error;
        }
      }

      return secretName;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to store wallet in Vault: ${message}`);
    }
  }

  async getWallet(userId: string, walletId: string): Promise<VaultWallet> {
    try {
      const secretName = this.getSecretName(VaultPath.WALLETS, userId, walletId);
      const secretValue = await this.getSecret(secretName);
      
      const wallet = JSON.parse(secretValue) as VaultWallet;
      
      // Update last accessed (async, don't await)
      this.updateLastAccessed(secretName, wallet).catch(console.error);
      
      return wallet;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get wallet from Vault: ${message}`);
    }
  }

  async getUserWallets(userId: string): Promise<VaultWallet[]> {
    try {
      const command = new ListSecretsCommand({
        Filters: [{ Key: 'name', Values: [this.getSecretName(VaultPath.WALLETS, userId)] }]
      });

      const response = await this.client.send(command);
      const wallets: VaultWallet[] = [];

      for (const secret of response.SecretList || []) {
        if (!secret.Name) {
          continue;
        }

        try {
          const secretValue = await this.getSecret(secret.Name);
          wallets.push(JSON.parse(secretValue) as VaultWallet);
        } catch (error) {
          console.warn(`⚠️ Failed to parse secret ${secret.Name}`);
        }
      }

      return wallets;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to list user wallets:', message);
      return [];
    }
  }

  async deleteWallet(userId: string, walletId: string): Promise<void> {
    try {
      const secretName = this.getSecretName(VaultPath.WALLETS, userId, walletId);
      
      const command = new DeleteSecretCommand({
        SecretId: secretName,
        ForceDeleteWithoutRecovery: true // Use recovery window in production
      });

      await this.client.send(command);
      console.log(`✅ Deleted wallet from Vault: ${secretName}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to delete wallet from Vault: ${message}`);
    }
  }

  async storeUser(user: VaultUser): Promise<string> {
    try {
      const secretName = this.getSecretName(VaultPath.USERS, user.userId);
      const secretValue = JSON.stringify(user);

      const command = new CreateSecretCommand({
        Name: secretName,
        SecretString: secretValue,
        Description: `User ${user.userId}`,
        Tags: [
          { Key: 'userId', Value: user.userId },
          { Key: 'type', Value: 'user' }
        ]
      });

      await this.client.send(command);
      console.log(`✅ Created user in Vault: ${secretName}`);
      return secretName;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to store user in Vault: ${message}`);
    }
  }

  async getUser(userId: string): Promise<VaultUser | null> {
    try {
      const secretName = this.getSecretName(VaultPath.USERS, userId);
      const secretValue = await this.getSecret(secretName);
      return JSON.parse(secretValue) as VaultUser;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        return null;
      }
      throw error;
    }
  }

  async updateUser(user: VaultUser): Promise<void> {
    try {
      const secretName = this.getSecretName(VaultPath.USERS, user.userId);
      const secretValue = JSON.stringify(user);

      const command = new UpdateSecretCommand({
        SecretId: secretName,
        SecretString: secretValue
      });

      await this.client.send(command);
      console.log(`✅ Updated user in Vault: ${secretName}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to update user in Vault: ${message}`);
    }
  }

  private async getSecret(secretName: string): Promise<string> {
    const command = new GetSecretValueCommand({
      SecretId: secretName
    });

    const response = await this.client.send(command);
    
    if (!response.SecretString) {
      throw new Error('Secret value is empty');
    }

    return response.SecretString;
  }

  private async updateLastAccessed(secretName: string, wallet: VaultWallet): Promise<void> {
    try {
      wallet.lastAccessed = new Date().toISOString();
      const command = new UpdateSecretCommand({
        SecretId: secretName,
        SecretString: JSON.stringify(wallet)
      });
      await this.client.send(command);
    } catch (error) {
      console.warn('⚠️ Failed to update last accessed timestamp');
    }
  }
}