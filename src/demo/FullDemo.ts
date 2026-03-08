import { AuthService } from '../auth/AuthService';
import { ethers } from 'ethers';

export async function runFullDemo() {
  console.clear();
  console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   🔐 AWS KMS + VAULT ENTERPRISE WALLET DEMO             ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
`);

  const authService = new AuthService();
  const testEmail = `test_${Date.now()}@example.com`;
  const testPassword = 'SecurePassword123!';

  try {
    console.log('\n📝 STEP 1: User Registration');
    console.log('-'.repeat(40));

    const registerResult = await authService.register(testEmail, testPassword);
    if (!registerResult.success) {
      throw new Error(registerResult.error || 'Registration failed');
    }
    console.log(`✅ User registered: ${registerResult.userId}`);

    console.log('\n🔐 STEP 2: User Login');
    console.log('-'.repeat(40));

    const loginResult = await authService.login(testEmail, testPassword);
    if (!loginResult.success) {
      throw new Error(loginResult.error || 'Login failed');
    }

    console.log('✅ Login successful');
    console.log(`   Session ID: ${loginResult.sessionId}`);
    console.log(`   Wallets: ${loginResult.wallets?.length || 0}`);

    console.log('\n💰 STEP 3: Create Wallets');
    console.log('-'.repeat(40));

    const wallet1 = await authService.createWallet(loginResult.userId!, loginResult.sessionId!);
    const wallet2 = await authService.createWallet(loginResult.userId!, loginResult.sessionId!);

    if (!wallet1.success || !wallet2.success || !wallet1.walletId || !wallet2.walletId) {
      throw new Error('Wallet creation failed');
    }

    console.log('✅ Created 2 wallets');
    console.log(`   Wallet 1: ${wallet1.publicAddress}`);
    console.log(`   Wallet 2: ${wallet2.publicAddress}`);

    console.log('\n✍️ STEP 4: Sign Transaction');
    console.log('-'.repeat(40));

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
      wallet1.walletId,
      transaction
    );

    if (!signResult.success) {
      throw new Error(signResult.error || 'Signing failed');
    }

    console.log('✅ Transaction signed');
    console.log(`   Signature: ${signResult.signedTx?.substring(0, 60)}...`);

    console.log('\n🚪 STEP 5: Logout');
    console.log('-'.repeat(40));

    const logoutResult = await authService.logout(loginResult.userId!, loginResult.sessionId!);
    if (!logoutResult) {
      throw new Error('Logout failed');
    }

    console.log('✅ Logout successful');

    console.log('\n🎉 DEMO COMPLETE!');
    console.log('✅ Private keys encrypted with KMS');
    console.log('✅ Stored securely in AWS Vault');
    console.log('✅ Decrypted only during login');
    console.log('✅ Re-encrypted with session key');
    console.log('✅ Cleared from memory on logout');
  } catch (error) {
    console.error('\n❌ Demo failed:', error);
  }
}

if (require.main === module) {
  runFullDemo().catch(console.error);
}
