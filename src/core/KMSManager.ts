import {
  KMSClient,
  GenerateDataKeyCommand,
  DecryptCommand,
  EncryptCommand,
  GenerateDataKeyCommandOutput,
  DecryptCommandOutput
} from '@aws-sdk/client-kms';
import { createKMSClient } from '../config/aws-config';

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
    this.client = createKMSClient();
    this.keyId = process.env.KMS_KEY_ID || 'alias/blockchain-wallet-key';
  }

  async generateDataKey(keySpec: 'AES_256' | 'AES_128' = 'AES_256'): Promise<DataKey> {
    try {
      console.log('🔑 Generating data key from KMS...');

      const command = new GenerateDataKeyCommand({
        KeyId: this.keyId,
        KeySpec: keySpec
      });

      const response: GenerateDataKeyCommandOutput = await this.client.send(command);

      if (!response.Plaintext || !response.CiphertextBlob) {
        throw new Error('Failed to generate data key');
      }

      const dataKey: DataKey = {
        plaintext: Buffer.from(response.Plaintext),
        ciphertext: Buffer.from(response.CiphertextBlob),
        keyId: response.KeyId || this.keyId,
        keyVersion: response.EncryptionContext?.KeyVersion
      };

      console.log('✅ Data key generated successfully');
      return dataKey;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`KMS GenerateDataKey failed: ${message}`);
    }
  }

  async decryptDataKey(ciphertextBlob: Buffer): Promise<Buffer> {
    try {
      console.log('🔓 Decrypting data key with KMS...');

      const command = new DecryptCommand({
        CiphertextBlob: ciphertextBlob,
        KeyId: this.keyId
      });

      const response: DecryptCommandOutput = await this.client.send(command);

      if (!response.Plaintext) {
        throw new Error('Failed to decrypt data key');
      }

      console.log('✅ Data key decrypted successfully');
      return Buffer.from(response.Plaintext);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`KMS Decrypt failed: ${message}`);
    }
  }

  async encryptWithKMS(plaintext: Buffer): Promise<Buffer> {
    try {
      const command = new EncryptCommand({
        KeyId: this.keyId,
        Plaintext: plaintext
      });

      const response = await this.client.send(command);
      return Buffer.from(response.CiphertextBlob || '');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`KMS Encrypt failed: ${message}`);
    }
  }
}
