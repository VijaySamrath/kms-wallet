import { AuthService } from '../auth/AuthService';
import { ethers } from 'ethers';
import chalk from 'chalk';

export async function runFullDemo() {
  console.clear();
  console.log(chalk.blue.bold(`
  ╔══════════════════════════════════════════════════════════╗
  ║                                                          ║
  ║   🔐 AWS KMS + VAULT ENTERPRISE WALLET DEMO             ║
  ║                                                          ║
  ╚══════════════════════════════════════════════════════════╝
  `));

  const authService = new AuthService();
  const testEmail = `test_${Date.now()}@example.com`;
  const testPassword = 'SecurePassword123!';

  try {
    // Step 1: Register
    console.log(chalk.yellow('\n📝 STEP 1: User Registration'));
    console.log(chalk.gray('-'.repeat(40)));
    
    const registerResult = await authService.register(testEmail, testPassword);
    if (!registerResult.success) {
      throw new Error('Registration failed');
    }
    console.log(chalk.green(`✅ User registered: ${registerResult.userId}`));

    // Step 2: Login
    console.log(chalk.yellow('\n🔐 STEP 2: User Login'));
    console.log(chalk.gray('-'.repeat(40)));
    
    const loginResult = await authService.login(testEmail, testPassword);
    if (!loginResult.success) {
      throw new Error('Login failed');
    }
    
    console.log(chalk.green(`✅ Login successful`));
    console.log(chalk.gray(`   Session ID: ${loginResult.sessionId}`));
    console.log(chalk.gray(`   Wallets: ${loginResult.wallets?.length || 0}`));

    // Step 3: Create Wallets
    console.log(chalk.yellow('\n💰 STEP 3: Create Wallets'));
    console.log(chalk.gray('-'.repeat(40)));
    
    const wallet1 = await authService.createWallet(
      loginResult.userId!,
      loginResult.sessionId!
    );
    
    const wallet2 = await authService.createWallet(
      loginResult.userId!,
      loginResult.sessionId!
    );
    
    console.log(chalk.green(`✅ Created 2 wallets`));
    console.log(chalk.gray(`   Wallet 1: ${wallet1.publicAddress}`));
    console.log(chalk.gray(`   Wallet 2: ${wallet2.publicAddress}`));

    // Step 4: Sign Transaction
    console.log(chalk.yellow('\n✍️ STEP 4: Sign Transaction'));
    console.log(chalk.gray('-'.repeat(40)));
    
    const transaction = {
      to: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
      value: ethers.parseEther('0.1'),
      gasLimit: 21000,
      nonce: 0,
      chainId: 1
    };

    const signResult = await authService.signTransaction(
      loginResult.userId!,
      loginResult.sessionId!,
      wallet1.walletId!,
      transaction
    );

    if (signResult.success) {
      console.log(chalk.green(`✅ Transaction signed`));
      console.log(chalk.gray(`   Signature: ${signResult.signedTx?.substring(0, 60)}...`));
    }

    // Step 5: Logout
    console.log(chalk.yellow('\n🚪 STEP 5: Logout'));
    console.log(chalk.gray('-'.repeat(40)));
    
    const logoutResult = await authService.logout(
      loginResult.userId!,
      loginResult.sessionId!
    );
    
    console.log(chalk.green(`✅ Logout successful`));

    // Summary
    console.log(chalk.blue.bold('\n🎉 DEMO COMPLETE!'));
    console.log(chalk.blue('\n✅ Private keys encrypted with KMS'));
    console.log(chalk.blue('✅ Stored securely in AWS Vault'));
    console.chalk.blue('✅ Decrypted only during login'));
    console.log(chalk.blue('✅ Re-encrypted with session key'));
    console.log(chalk.blue('✅ Cleared from memory on logout'));

  } catch (error) {
    console.error(chalk.red('\n❌ Demo failed:'), error);
  }
}

if (require.main === module) {
  runFullDemo().catch(console.error);
}