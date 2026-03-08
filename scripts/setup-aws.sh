#!/bin/bash

echo "🔧 Setting up AWS Resources for Wallet Management"
echo "=================================================="

# Configuration
REGION=${1:-us-east-1}
PROFILE=${2:-default}
KEY_ALIAS="alias/blockchain-wallet-key"

# 1. Create KMS Key
echo -e "\n1. Creating KMS Master Key..."
KEY_ID=$(aws kms create-key \
  --region $REGION \
  --profile $PROFILE \
  --description "Master key for blockchain wallet encryption" \
  --key-usage ENCRYPT_DECRYPT \
  --origin AWS_KMS \
  --query 'KeyMetadata.KeyId' \
  --output text)

echo "   ✅ KMS Key created: $KEY_ID"

# 2. Enable automatic rotation
echo -e "\n2. Enabling automatic key rotation..."
aws kms enable-key-rotation \
  --region $REGION \
  --profile $PROFILE \
  --key-id $KEY_ID

echo "   ✅ Automatic rotation enabled (365 days)"

# 3. Create alias
echo -e "\n3. Creating key alias..."
aws kms create-alias \
  --region $REGION \
  --profile $PROFILE \
  --alias-name $KEY_ALIAS \
  --target-key-id $KEY_ID

echo "   ✅ Alias created: $KEY_ALIAS"

# 4. Get key ARN
KEY_ARN=$(aws kms describe-key \
  --region $REGION \
  --profile $PROFILE \
  --key-id $KEY_ID \
  --query 'KeyMetadata.Arn' \
  --output text)

echo -e "\n📋 KMS Key Information:"
echo "   Key ID: $KEY_ID"
echo "   Key ARN: $KEY_ARN"
echo "   Alias: $KEY_ALIAS"

# 5. Create IAM policy
echo -e "\n4. Creating IAM policy for wallet management..."

cat > wallet-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "kms:GenerateDataKey",
                "kms:Decrypt",
                "kms:Encrypt",
                "kms:DescribeKey"
            ],
            "Resource": "$KEY_ARN"
        },
        {
            "Effect": "Allow",
            "Action": [
                "secretsmanager:GetSecretValue",
                "secretsmanager:CreateSecret",
                "secretsmanager:UpdateSecret",
                "secretsmanager:DeleteSecret",
                "secretsmanager:ListSecrets",
                "secretsmanager:TagResource"
            ],
            "Resource": "arn:aws:secretsmanager:$REGION:*:secret:wallet/*"
        }
    ]
}
EOF

POLICY_ARN=$(aws iam create-policy \
  --profile $PROFILE \
  --policy-name WalletManagementPolicy \
  --policy-document file://wallet-policy.json \
  --query 'Policy.Arn' \
  --output text)

echo "   ✅ IAM Policy created: $POLICY_ARN"

# 6. Create .env file
echo -e "\n5. Creating .env file..."
cat > .env << EOF
# AWS Configuration
AWS_REGION=$REGION
AWS_PROFILE=$PROFILE
KMS_KEY_ID=$KEY_ALIAS
KMS_KEY_ARN=$KEY_ARN

# Server Configuration
PORT=3000
NODE_ENV=development
SESSION_SECRET=$(openssl rand -hex 32)
SESSION_TIMEOUT_MINUTES=30

# Security
BCRYPT_ROUNDS=10
MAX_WALLETS_PER_USER=10
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
LOG_FILE=logs/app.log
EOF

echo "   ✅ .env file created"

echo -e "\n🎉 Setup Complete!"
echo "=================================================="
echo ""
echo "Next steps:"
echo "1. Attach the IAM policy to your role/user: $POLICY_ARN"
echo "2. Update .env file with your specific settings"
echo "3. Run: npm install"
echo "4. Run: npm run demo"