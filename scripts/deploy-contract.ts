import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('🚀 Deploying Soulbound NFT Contract...');
  console.log('=====================================');

  // Connect to network
  const provider = new ethers.JsonRpcProvider(process.env.ETH_RPC_URL);
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);
  
  console.log(`📡 Deployer address: ${wallet.address}`);
  console.log(`🌐 Network: ${await provider.getNetwork().then(n => n.name)}`);

  // Read contract bytecode and ABI
  const contractPath = path.join(__dirname, '../contracts/SoulboundNFT.sol');
  const contractSource = fs.readFileSync(contractPath, 'utf8');
  
  // Compile (in production, use hardhat or truffle)
  // For demo, we'll assume you've compiled it
  
  const abi = []; // Load your compiled ABI
  const bytecode = ''; // Load your compiled bytecode

  // Deploy contract
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy();
  
  await contract.waitForDeployment();
  
  const contractAddress = await contract.getAddress();
  
  console.log(`✅ Contract deployed at: ${contractAddress}`);
  
  // Save deployment info
  const deploymentInfo = {
    address: contractAddress,
    deployer: wallet.address,
    timestamp: new Date().toISOString(),
    network: await provider.getNetwork().then(n => n.chainId)
  };
  
  fs.writeFileSync(
    path.join(__dirname, '../contracts/deployment.json'),
    JSON.stringify(deploymentInfo, null, 2)
  );
  
  console.log('\n📄 Deployment info saved to contracts/deployment.json');
  console.log('\n🎉 Deployment complete!');
}

main().catch(console.error);