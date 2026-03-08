#!/usr/bin/env node

import { runFullDemo } from './demo/FullDemo';
import { app } from './api/server';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const command = process.argv[2];

  switch (command) {
    case 'demo':
      await runFullDemo();
      break;
      
    case 'server':
      // Server already starts from import
      console.log('🚀 Server is running...');
      break;
      
    case 'help':
    default:
      console.log(`
🔐 AWS KMS + Vault Enterprise Wallet

Usage:
  npm start           Start the API server
  npm run demo        Run the full demonstration
  npm run server:dev  Start server in development mode
  npm run build       Build the project
      `);
      break;
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { app };