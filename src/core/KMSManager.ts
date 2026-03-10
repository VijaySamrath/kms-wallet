import {
  KMSClient,
  GenerateDataKeyCommand,
  DecryptCommand,
  GenerateDataKeyCommandOutput,
  DecryptCommandOutput
} from '@aws-sdk/client-kms';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { awsConfig } from '../config/aws-config';
import { MemoryCleaner } from '../utils/MemoryCleaner';

export interface DataKey {
  plaintext: Buffer;
  ciphertext: Buffer;
  keyId: string;
  keyVersion?: string;
}

export class KMSManager {
  private client: KMSClient;
  private keyId: string;

  constructor() {
    this.client = new KMSClient({
      region: awsConfig.region,
      credentials: fromNodeProviderChain()
    });
    this.keyId = awsConfig.kmsKeyId;
  }

  /**
   * Generate a new data encryption key (DEK) using KMS
   */
  async generateDataKey(keySpec: 'AES_256' | 'AES_128' = 'AES_256'): Promise<DataKey> {
    try {
      console.log('🔑 Generating data key from KMS...');
      
      const command = new GenerateDataKeyCommand({
        KeyId: this.keyId,
        KeySpec: keySpec,
      });

      const response: GenerateDataKeyCommandOutput = await this.client.send(command);

      if (!response.Plaintext || !response.CiphertextBlob) {
        throw new Error('Failed to generate data key: Missing Plaintext or CiphertextBlob');
      }

      // Extract key version from KeyId (ARN format: arn:aws:kms:region:account:key/key-id)
      // Or use a timestamp as version
      const keyVersion = new Date().getTime().toString();

      const dataKey: DataKey = {
        plaintext: Buffer.from(response.Plaintext),
        ciphertext: Buffer.from(response.CiphertextBlob),
        keyId: response.KeyId || this.keyId,
        keyVersion: keyVersion
      };

      console.log('✅ Data key generated successfully');
      console.log(`   • Key ID: ${dataKey.keyId}`);
      console.log(`   • Key Version: ${dataKey.keyVersion}`);
      console.log(`   • Plaintext length: ${dataKey.plaintext.length} bytes`);
      console.log(`   • Ciphertext length: ${dataKey.ciphertext.length} bytes`);

      return dataKey;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ KMS GenerateDataKey failed:', message);
      throw new Error(`KMS GenerateDataKey failed: ${message}`);
    }
  }

  /**
   * Decrypt a data encryption key using KMS
   */
  async decryptDataKey(ciphertextBlob: Buffer): Promise<Buffer> {
    try {
      console.log('🔓 Decrypting data key with KMS...');

      const command = new DecryptCommand({
        CiphertextBlob: ciphertextBlob,
        KeyId: this.keyId
      });

      const response: DecryptCommandOutput = await this.client.send(command);

      if (!response.Plaintext) {
        throw new Error('Failed to decrypt data key: Missing Plaintext');
      }

      console.log('✅ Data key decrypted successfully');
      console.log(`   • Key ID: ${response.KeyId || this.keyId}`);
      console.log(`   • Encryption Algorithm: ${response.EncryptionAlgorithm || 'SYMMETRIC_DEFAULT'}`);

      return Buffer.from(response.Plaintext);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ KMS Decrypt failed:', message);
      throw new Error(`KMS Decrypt failed: ${message}`);
    }
  }

  /**
   * Generate a data key with encryption context (if you need to store metadata)
   * Note: This doesn't return the context in the response, but it's used during encryption
   */
  async generateDataKeyWithContext(keySpec: 'AES_256' | 'AES_128' = 'AES_256', context: Record<string, string>): Promise<DataKey> {
    try {
      console.log('🔑 Generating data key with encryption context...');
      
      const command = new GenerateDataKeyCommand({
        KeyId: this.keyId,
        KeySpec: keySpec,
        EncryptionContext: context
      });

      const response: GenerateDataKeyCommandOutput = await this.client.send(command);

      if (!response.Plaintext || !response.CiphertextBlob) {
        throw new Error('Failed to generate data key');
      }

      // The encryption context is not returned in the response
      // but it's cryptographically bound to the ciphertext
      const dataKey: DataKey = {
        plaintext: Buffer.from(response.Plaintext),
        ciphertext: Buffer.from(response.CiphertextBlob),
        keyId: response.KeyId || this.keyId,
        keyVersion: new Date().getTime().toString()
      };

      console.log('✅ Data key with context generated successfully');
      console.log(`   • Context used:`, context);

      return dataKey;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ KMS GenerateDataKey failed:', message);
      throw new Error(`KMS GenerateDataKey failed: ${message}`);
    }
  }

  /**
   * Decrypt with encryption context verification
   */
  async decryptDataKeyWithContext(ciphertextBlob: Buffer, context: Record<string, string>): Promise<Buffer> {
    try {
      console.log('🔓 Decrypting data key with context verification...');

      const command = new DecryptCommand({
        CiphertextBlob: ciphertextBlob,
        KeyId: this.keyId,
        EncryptionContext: context
      });

      const response: DecryptCommandOutput = await this.client.send(command);

      if (!response.Plaintext) {
        throw new Error('Failed to decrypt data key');
      }

      console.log('✅ Data key decrypted with context verification');
      console.log(`   • Context verified:`, context);

      return Buffer.from(response.Plaintext);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ KMS Decrypt with context failed:', message);
      throw new Error(`KMS Decrypt failed: ${message}`);
    }
  }

  /**
   * Get key rotation status (if you want to check)
   */
  async getKeyRotationStatus(): Promise<boolean> {
    try {
      const { GetKeyRotationStatusCommand } = await import('@aws-sdk/client-kms');
      
      const command = new GetKeyRotationStatusCommand({
        KeyId: this.keyId
      });

      const response = await this.client.send(command);
      return response.KeyRotationEnabled || false;
    } catch (error) {
      console.warn('⚠️ Could not fetch key rotation status');
      return false;
    }
  }
}