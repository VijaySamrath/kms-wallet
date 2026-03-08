#!/bin/bash

echo "🚀 Deploying Wallet Management System"
echo "======================================"

# Build TypeScript
echo -e "\n1. Building TypeScript..."
npm run build

# Check build status
if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi
echo "   ✅ Build successful"

# Run tests
echo -e "\n2. Running tests..."
npm test

# Copy necessary files
echo -e "\n3. Preparing deployment package..."
mkdir -p deploy
cp -r dist deploy/
cp package.json deploy/
cp package-lock.json deploy/
cp .env deploy/
cp -r node_modules deploy/

echo "   ✅ Deployment package ready in ./deploy"

# Deploy to AWS (example for Elastic Beanstalk)
if [ "$1" == "aws" ]; then
    echo -e "\n4. Deploying to AWS Elastic Beanstalk..."
    
    # Create deployment archive
    cd deploy
    zip -r ../deploy.zip .
    cd ..
    
    # Deploy to Elastic Beanstalk
    aws elasticbeanstalk create-application-version \
        --application-name wallet-app \
        --version-label v$(date +%Y%m%d%H%M%S) \
        --source-bundle S3Bucket=your-bucket,S3Key=deploy.zip
    
    echo "   ✅ Deployed to AWS"
fi

echo -e "\n🎉 Deployment complete!"