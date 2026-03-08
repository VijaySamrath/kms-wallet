import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { KMSClient } from '@aws-sdk/client-kms';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import dotenv from 'dotenv';

dotenv.config();

export const awsConfig = {
  region: process.env.AWS_REGION || 'us-east-1',
  kmsKeyId: process.env.KMS_KEY_ID || 'alias/blockchain-wallet-key',
  kmsKeyArn: process.env.KMS_KEY_ARN,
};

export const createKMSClient = (): KMSClient => {
  return new KMSClient({
    region: awsConfig.region,
    credentials: fromNodeProviderChain(),
  });
};

export const createSecretsManagerClient = (): SecretsManagerClient => {
  return new SecretsManagerClient({
    region: awsConfig.region,
    credentials: fromNodeProviderChain(),
  });
};