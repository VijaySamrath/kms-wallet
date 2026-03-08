# KMS Wallet Enterprise

AWS KMS + AWS Secrets Manager based wallet demo.

## What this repo does

- Registers a user in Secrets Manager (`wallet/users/...`).
- Creates blockchain wallets and encrypts private keys with a KMS-generated data key.
- Stores encrypted wallet payloads in Secrets Manager (`wallet/wallets/...`).
- During login, decrypts wallet keys into short-lived session storage.
- Signs transactions from the in-memory session wallet.

## 1) Environment setup

1. Copy env template:
   ```bash
   cp .env.example .env
   ```
2. Fill `.env` values:
   - `AWS_REGION`
   - `KMS_KEY_ID` (alias or key id, e.g. `alias/blockchain-wallet-key`)
   - `SESSION_SECRET`

> If your current `.env` has commented legacy names, use these canonical names:
> - `AWS_REGION`
> - `KMS_KEY_ID`
> - `KMS_KEY_ARN`

## 2) AWS setup (optional helper)

Use the helper script to create KMS key + IAM policy + `.env` skeleton:

```bash
npm run setup
```

Or manually create a KMS key and grant permissions for:

- `kms:GenerateDataKey`
- `kms:Decrypt`
- `kms:Encrypt`
- `secretsmanager:CreateSecret`
- `secretsmanager:GetSecretValue`
- `secretsmanager:UpdateSecret`
- `secretsmanager:DeleteSecret`
- `secretsmanager:ListSecrets`

## 3) Install + build

```bash
npm install
npm run check
npm run build
```

## 4) Run wallet flow script

This executes register → login → create wallets → sign transaction → logout.

```bash
npm run demo
```

## 5) Run API server

```bash
npm run server:dev
# or
npm run build && npm start
```

## Common troubleshooting

- **`CredentialsProviderError`**: AWS credentials are not configured.
- **`AccessDeniedException`**: IAM policy is missing KMS/SecretsManager permissions.
- **`ResourceNotFoundException` for KMS key**: wrong `KMS_KEY_ID` (alias/key id mismatch).
- **Secrets not listed for a user**: ensure secrets are created under `wallet/wallets/<userId>/...`.
