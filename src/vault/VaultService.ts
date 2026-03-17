import {
  SecretsManagerClient,
  GetSecretValueCommand,
  CreateSecretCommand,
  UpdateSecretCommand,
  DeleteSecretCommand,
  ListSecretsCommand,
  ResourceNotFoundException,
  FilterNameStringType
} from '@aws-sdk/client-secrets-manager';
import { createSecretsManagerClient } from '../config/aws-config';
import { VaultWallet, VaultUser, VaultPath } from './VaultModels';

// New interfaces for NFT contracts and mint records
export interface ContractData {
  address: string;
  name: string;
  symbol: string;
  deployedBy: string;
  deployedAt: string;
}

export interface MintRecord {
  tokenId: string;
  userWalletId: string;
  userAddress: string;
  contractAddress: string;
  transactionHash: string;
  metadata: any;
  mintedAt: string;
  mintedBy: string;
}

export class VaultService {
  private client: SecretsManagerClient;
  private prefix: string;

  constructor(prefix: string = 'wallet') {
    this.client = createSecretsManagerClient();
    this.prefix = prefix;
  }

  private getSecretName(path: VaultPath | string, ...parts: string[]): string {
    return `${this.prefix}/${path}/${parts.join('/')}`;
  }

  // ==================== WALLET METHODS ====================

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

  async getWalletByWalletId(walletId: string): Promise<VaultWallet | null> {
    try {
      // List all secrets with this walletId tag
      const command = new ListSecretsCommand({
        Filters: [
          { Key: 'tag-key' as FilterNameStringType, Values: ['walletId'] },
          { Key: 'tag-value' as FilterNameStringType, Values: [walletId] }
        ]
      });

      const response = await this.client.send(command);
      
      if (!response.SecretList || response.SecretList.length === 0) {
        return null;
      }

      const secretName = response.SecretList[0].Name;
      if (!secretName) return null;

      const secretValue = await this.getSecret(secretName);
      return JSON.parse(secretValue) as VaultWallet;
    } catch (error) {
      console.error('Failed to get wallet by ID:', error);
      return null;
    }
  }

  async getUserWallets(userId: string): Promise<VaultWallet[]> {
    try {
      const command = new ListSecretsCommand({
        Filters: [
          { Key: 'tag-key' as FilterNameStringType, Values: ['userId'] },
          { Key: 'tag-value' as FilterNameStringType, Values: [userId] },
          { Key: 'tag-key' as FilterNameStringType, Values: ['type'] },
          { Key: 'tag-value' as FilterNameStringType, Values: ['wallet'] }
        ]
      });

      const response = await this.client.send(command);
      const wallets: VaultWallet[] = [];

      for (const secret of response.SecretList || []) {
        if (secret.Name) {
          try {
            const secretValue = await this.getSecret(secret.Name);
            wallets.push(JSON.parse(secretValue));
          } catch (error) {
            console.warn(`⚠️ Failed to parse secret ${secret.Name}`);
          }
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

  // ==================== USER METHODS ====================

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

  // ==================== CONTRACT METHODS (NEW) ====================

  async storeContract(contract: ContractData): Promise<string> {
    try {
      const secretName = this.getSecretName('contracts', contract.address);
      const secretValue = JSON.stringify(contract);

      try {
        // Try to get existing secret
        await this.getSecret(secretName);
        
        // Update if exists
        const command = new UpdateSecretCommand({
          SecretId: secretName,
          SecretString: secretValue,
          Description: `NFT Contract ${contract.name} (${contract.symbol})`
        });
        await this.client.send(command);
        console.log(`✅ Updated contract in Vault: ${secretName}`);
      } catch (error) {
        if (error instanceof ResourceNotFoundException) {
          // Create if doesn't exist
          const command = new CreateSecretCommand({
            Name: secretName,
            SecretString: secretValue,
            Description: `NFT Contract ${contract.name} (${contract.symbol})`,
            Tags: [
              { Key: 'type', Value: 'contract' },
              { Key: 'address', Value: contract.address },
              { Key: 'name', Value: contract.name },
              { Key: 'symbol', Value: contract.symbol }
            ]
          });
          await this.client.send(command);
          console.log(`✅ Created new contract in Vault: ${secretName}`);
        } else {
          throw error;
        }
      }

      return secretName;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to store contract in Vault: ${message}`);
    }
  }

  async getContract(address?: string): Promise<ContractData | null> {
    try {
      let contractAddress = address;
      
      if (!contractAddress) {
        // Get the most recent contract (assuming only one for demo)
        const command = new ListSecretsCommand({
          Filters: [
            { Key: 'tag-key' as FilterNameStringType, Values: ['type'] },
            { Key: 'tag-value' as FilterNameStringType, Values: ['contract'] }
          ]
        });

        const response = await this.client.send(command);
        
        if (!response.SecretList || response.SecretList.length === 0) {
          return null;
        }

        const secretName = response.SecretList[0].Name;
        if (!secretName) return null;

        const secretValue = await this.getSecret(secretName);
        return JSON.parse(secretValue) as ContractData;
      } else {
        const secretName = this.getSecretName('contracts', contractAddress);
        const secretValue = await this.getSecret(secretName);
        return JSON.parse(secretValue) as ContractData;
      }
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        return null;
      }
      console.error('Failed to get contract:', error);
      return null;
    }
  }

  // ==================== MINT RECORD METHODS (NEW) ====================


  async getMintRecord(tokenId: string): Promise<MintRecord | null> {
    try {
      const secretName = this.getSecretName('mints', tokenId);
      const secretValue = await this.getSecret(secretName);
      return JSON.parse(secretValue) as MintRecord;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        return null;
      }
      console.error('Failed to get mint record:', error);
      return null;
    }
  }


  // ==================== ADMIN WALLET METHODS (NEW) ====================

  async storeAdminWallet(walletId: string, publicAddress: string, encryptedPrivateKey: string): Promise<string> {
    try {
      const secretName = this.getSecretName('admin', 'wallets', walletId);
      const secretValue = JSON.stringify({
        walletId,
        publicAddress,
        encryptedPrivateKey,
        createdAt: new Date().toISOString()
      });

      const command = new CreateSecretCommand({
        Name: secretName,
        SecretString: secretValue,
        Description: `Admin wallet: ${publicAddress}`,
        Tags: [
          { Key: 'type', Value: 'admin-wallet' },
          { Key: 'walletId', Value: walletId },
          { Key: 'publicAddress', Value: publicAddress }
        ]
      });

      await this.client.send(command);
      console.log(`✅ Created admin wallet in Vault: ${secretName}`);
      return secretName;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to store admin wallet in Vault: ${message}`);
    }
  }

  async getAdminWallet(walletId: string): Promise<{ walletId: string; publicAddress: string; encryptedPrivateKey: string } | null> {
    try {
      const secretName = this.getSecretName('admin', 'wallets', walletId);
      const secretValue = await this.getSecret(secretName);
      return JSON.parse(secretValue);
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        return null;
      }
      console.error('Failed to get admin wallet:', error);
      return null;
    }
  }

  // ==================== UTILITY METHODS ====================

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

  async deleteSecret(secretName: string): Promise<void> {
    try {
      const command = new DeleteSecretCommand({
        SecretId: secretName,
        ForceDeleteWithoutRecovery: true
      });

      await this.client.send(command);
      console.log(`✅ Deleted secret: ${secretName}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to delete secret: ${message}`);
    }
  }

  async listAllSecrets(type?: string): Promise<string[]> {
    try {
      const filters = [];
      if (type) {
        filters.push({ Key: 'tag-key' as FilterNameStringType, Values: ['type'] });
        filters.push({ Key: 'tag-value' as FilterNameStringType, Values: [type] });
      }

      const command = new ListSecretsCommand({
        Filters: filters.length > 0 ? filters : undefined
      });

      const response = await this.client.send(command);
      return response.SecretList?.map(s => s.Name).filter(Boolean) as string[] || [];
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to list secrets:', message);
      return [];
    }
  }

  async storeMintRecord(record: MintRecord): Promise<string> {
    try {
      const secretName = `wallet/mints/${record.tokenId}`;
      const secretValue = JSON.stringify(record);
  
      const command = new CreateSecretCommand({
        Name: secretName,
        SecretString: secretValue,
        Description: `NFT Mint Record for Token ID ${record.tokenId}`,
        Tags: [
          { Key: 'type', Value: 'nft-mint' },
          { Key: 'userWalletId', Value: record.userWalletId },
          { Key: 'tokenId', Value: record.tokenId }
        ]
      });
  
      await this.client.send(command);
      console.log(`✅ Mint record stored: ${secretName}`);
      return secretName;
    } catch (error: any) {
      // If secret exists, update it
      if (error.name === 'ResourceExistsException') {
        const secretName = `wallet/mints/${record.tokenId}`;
        const updateCommand = new UpdateSecretCommand({
          SecretId: secretName,
          SecretString: JSON.stringify(record)
        });
        await this.client.send(updateCommand);
        return secretName;
      }
      throw error;
    }
  }
  
  /**
   * Get mint record by user wallet ID
   */
  async getMintRecordByUser(userWalletId: string): Promise<MintRecord | null> {
    try {
      const command = new ListSecretsCommand({
        Filters: [
          { Key: 'tag-key', Values: ['userWalletId'] },
          { Key: 'tag-value', Values: [userWalletId] },
          { Key: 'tag-key', Values: ['type'] },
          { Key: 'tag-value', Values: ['nft-mint'] }
        ]
      });
  
      const response = await this.client.send(command);
      
      if (response.SecretList && response.SecretList.length > 0) {
        const secretName = response.SecretList[0].Name;
        if (secretName) {
          const secretValue = await this.getSecret(secretName);
          return JSON.parse(secretValue) as MintRecord;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching mint record:', error);
      return null;
    }
  }
  
  /**
   * Get all mint records
   */
  async getAllMintRecords(): Promise<MintRecord[]> {
    try {
      const command = new ListSecretsCommand({
        Filters: [
          { Key: 'tag-key', Values: ['type'] },
          { Key: 'tag-value', Values: ['nft-mint'] }
        ]
      });
  
      const response = await this.client.send(command);
      const records: MintRecord[] = [];
  
      for (const secret of response.SecretList || []) {
        if (secret.Name) {
          try {
            const secretValue = await this.getSecret(secret.Name);
            records.push(JSON.parse(secretValue));
          } catch (error) {
            console.warn(`⚠️ Failed to parse mint record: ${secret.Name}`);
          }
        }
      }
  
      return records;
    } catch (error) {
      console.error('Error fetching mint records:', error);
      return [];
    }
  }
  
  /**
   * Update user's wallet record with NFT status
   */
  async updateUserNFTStatus(userWalletId: string, hasNFT: boolean, tokenId?: string): Promise<void> {
    try {
      // Find the wallet secret
      const command = new ListSecretsCommand({
        Filters: [
          { Key: 'tag-key', Values: ['walletId'] },
          { Key: 'tag-value', Values: [userWalletId] }
        ]
      });
  
      const response = await this.client.send(command);
      
      if (response.SecretList && response.SecretList.length > 0) {
        const secretName = response.SecretList[0].Name;
        if (secretName) {
          const secretValue = await this.getSecret(secretName);
          const wallet = JSON.parse(secretValue);
          
          // Add NFT info to wallet record
          wallet.hasNFT = hasNFT;
          if (tokenId) {
            wallet.nftTokenId = tokenId;
          }
          
          const updateCommand = new UpdateSecretCommand({
            SecretId: secretName,
            SecretString: JSON.stringify(wallet)
          });
          
          await this.client.send(updateCommand);
          console.log(`✅ Updated wallet ${userWalletId} with NFT status`);
        }
      }
    } catch (error) {
      console.error('Error updating user NFT status:', error);
    }
  }
  
  /**
   * Store metadata URI mapping
   */
  async storeMetadata(uri: string, metadata: any): Promise<void> {
    try {
      const secretName = `wallet/metadata/${Buffer.from(uri).toString('base64').substring(0, 20)}`;
      
      const command = new CreateSecretCommand({
        Name: secretName,
        SecretString: JSON.stringify({ uri, metadata, createdAt: new Date().toISOString() }),
        Description: `NFT Metadata: ${uri}`,
        Tags: [{ Key: 'type', Value: 'metadata' }]
      });
  
      await this.client.send(command);
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error storing metadata:', error.message);
      }
    }
  }
}