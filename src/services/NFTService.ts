import { ethers } from 'ethers';
import { VaultService } from '../vault/VaultService';
import { MemoryCleaner } from '../utils/MemoryCleaner';
import dotenv from 'dotenv';

dotenv.config();

// Soulbound NFT Contract ABI (minimal - you'll need your full ABI)
const SOULBOUND_ABI = [
  "function mint(address to, string memory tokenURI) public returns (uint256)",
  "function hasMinted(address user) public view returns (bool)",
  "function ownerOf(uint256 tokenId) public view returns (address)",
  "function tokenURI(uint256 tokenId) public view returns (string)",
  "function balanceOf(address owner) public view returns (uint256)",
  "function totalSupply() public view returns (uint256)",
  "function name() public view returns (string)",
  "function symbol() public view returns (string)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
];

export interface NFTMetadata {
  name: string;
  description: string;
  image: string;
  attributes: Array<{ trait_type: string; value: string | number }>;
}

export interface MintRecord {
  tokenId: string;
  userWalletId: string;
  userAddress: string;
  contractAddress: string;
  transactionHash: string;
  metadata: NFTMetadata;
  mintedAt: string;
  mintedBy: string;
}

export class NFTService {
  private vault: VaultService;
  private provider: ethers.JsonRpcProvider;
  private contractAddress: string;
  private deployerPrivateKey: string;
  private chainId: number;

  constructor() {
    this.vault = new VaultService();
    
    // Get config from .env
    this.contractAddress = process.env.CONTRACT_ADDRESS || '';
    this.deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY || '';
    this.chainId = parseInt(process.env.CHAIN_ID || '11155111');
    
    // Validate config
    if (!this.contractAddress) {
      throw new Error('CONTRACT_ADDRESS not set in .env');
    }
    if (!this.deployerPrivateKey) {
      throw new Error('DEPLOYER_PRIVATE_KEY not set in .env');
    }
    
    // Connect to Ethereum network
    this.provider = new ethers.JsonRpcProvider(
      process.env.ETH_RPC_URL || 'https://sepolia.infura.io/v3/YOUR_PROJECT_ID'
    );
    
    console.log(`📄 NFT Service initialized`);
    console.log(`   Contract: ${this.contractAddress}`);
    console.log(`   Network: ${process.env.ETH_NETWORK || 'sepolia'}`);
    console.log(`   Admin Address: ${this.getAdminAddress()}`);
  }

  /**
   * Get admin wallet address from private key
   */
  getAdminAddress(): string {
    try {
      const wallet = new ethers.Wallet(this.deployerPrivateKey);
      return wallet.address;
    } catch (error) {
      console.error('❌ Invalid admin private key');
      return 'Invalid Key';
    }
  }

  /**
   * Mint Soulbound NFT to user wallet
   */
  async mintNFT(
    userWalletId: string,
    metadata: NFTMetadata
  ): Promise<{ success: boolean; tokenId?: number; transactionHash?: string; error?: string }> {
    try {
      console.log(`🎨 Minting Soulbound NFT to wallet: ${userWalletId}`);

      // Get user wallet from vault
      const userWallet = await this.vault.getWalletByWalletId(userWalletId);
      if (!userWallet) {
        throw new Error(`User wallet not found: ${userWalletId}`);
      }

      console.log(`   User address: ${userWallet.publicAddress}`);

      // Create admin wallet from .env private key
      const adminWallet = new ethers.Wallet(this.deployerPrivateKey, this.provider);
      console.log(`   Admin address: ${adminWallet.address}`);

      // Create contract instance
      const nftContract = new ethers.Contract(
        this.contractAddress,
        SOULBOUND_ABI,
        adminWallet
      );

      // Get contract info (optional, just to verify connection)
      try {
        const contractName = await nftContract.name();
        const contractSymbol = await nftContract.symbol();
        console.log(`   Contract: ${contractName} (${contractSymbol})`);
      } catch (error) {
        console.log('   ⚠️ Could not fetch contract name, but continuing...');
      }

      // Check if user already has NFT
      const hasMinted = await nftContract.hasMinted(userWallet.publicAddress);
      if (hasMinted) {
        throw new Error(`User ${userWallet.publicAddress} already has a soulbound NFT`);
      }

      // Upload metadata (you can implement IPFS upload or use a service)
      const tokenURI = await this.uploadMetadata(metadata);

      console.log(`   Minting with tokenURI: ${tokenURI}`);

      // Mint NFT
      const tx = await nftContract.mint(userWallet.publicAddress, tokenURI);
      console.log(`   Transaction sent: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await tx.wait();
      console.log(`   Transaction confirmed in block: ${receipt.blockNumber}`);

      // Get token ID from events
      let tokenId: string | undefined;
      for (const log of receipt.logs) {
        try {
          const parsedLog = nftContract.interface.parseLog(log);
          if (parsedLog && parsedLog.name === 'Transfer') {
            tokenId = parsedLog.args.tokenId.toString();
            break;
          }
        } catch (e) {
          // Not a log from our contract, skip
        }
      }

      if (!tokenId) {
        throw new Error('Could not find token ID in transaction logs');
      }

      // Store mint record in vault
      const mintRecord: MintRecord = {
        tokenId,
        userWalletId,
        userAddress: userWallet.publicAddress,
        contractAddress: this.contractAddress,
        transactionHash: receipt.hash,
        metadata,
        mintedAt: new Date().toISOString(),
        mintedBy: adminWallet.address
      };

      await this.vault.storeMintRecord(mintRecord);

      // Also update user's wallet record to indicate they have an NFT
      await this.vault.updateUserNFTStatus(userWalletId, true, tokenId);

      console.log(`✅ NFT minted! Token ID: ${tokenId}`);
      console.log(`   Transaction: ${receipt.hash}`);
      console.log(`   Explorer: https://sepolia.etherscan.io/tx/${receipt.hash}`);

      return {
        success: true,
        tokenId: parseInt(tokenId),
        transactionHash: receipt.hash
      };

    } catch (error: any) {
      console.error('❌ NFT minting failed:', error);
      return { 
        success: false, 
        error: error.message || 'Unknown error occurred'
      };
    }
  }

  /**
   * Mint NFT to multiple user wallets (batch mint)
   */
  async mintNFTBatch(
    userWalletIds: string[],
    metadata: NFTMetadata
  ): Promise<{
    success: boolean;
    results: Array<{ walletId: string; success: boolean; tokenId?: number; error?: string }>;
  }> {
    console.log(`🎨 Batch minting to ${userWalletIds.length} wallets`);

    const results = [];

    for (const walletId of userWalletIds) {
      try {
        const result = await this.mintNFT(walletId, metadata);
        results.push({
          walletId,
          success: result.success,
          tokenId: result.tokenId,
          error: result.error
        });
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error: any) {
        results.push({
          walletId,
          success: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`✅ Batch mint complete: ${successCount}/${userWalletIds.length} successful`);

    return {
      success: successCount > 0,
      results
    };
  }

  /**
   * Check if user has NFT
   */
  async checkUserNFT(userWalletId: string): Promise<{
    hasNFT: boolean;
    tokenId?: number;
    metadata?: NFTMetadata;
    contractAddress?: string;
  }> {
    try {
      const userWallet = await this.vault.getWalletByWalletId(userWalletId);
      if (!userWallet) {
        throw new Error('User wallet not found');
      }

      // First check in vault (faster)
      const mintRecord = await this.vault.getMintRecordByUser(userWalletId);
      
      if (mintRecord) {
        return {
          hasNFT: true,
          tokenId: parseInt(mintRecord.tokenId),
          metadata: mintRecord.metadata,
          contractAddress: mintRecord.contractAddress
        };
      }

      // If not in vault, check on-chain (optional)
      try {
        const adminWallet = new ethers.Wallet(this.deployerPrivateKey, this.provider);
        const nftContract = new ethers.Contract(
          this.contractAddress,
          SOULBOUND_ABI,
          adminWallet
        );

        const hasMinted = await nftContract.hasMinted(userWallet.publicAddress);
        
        if (hasMinted) {
          // Find token ID by checking balance and tokens (more complex)
          // For simplicity, we'll just return true without token ID
          return {
            hasNFT: true,
            contractAddress: this.contractAddress
          };
        }
      } catch (error) {
        console.log('⚠️ On-chain check failed, using vault data only');
      }

      return { hasNFT: false };

    } catch (error: any) {
      console.error('Error checking NFT:', error);
      return { hasNFT: false };
    }
  }

  /**
   * Get all minted NFTs from vault
   */
  async getAllMintedNFTs(): Promise<Array<{
    tokenId: number;
    ownerAddress: string;
    ownerWalletId: string;
    metadata: NFTMetadata;
    mintedAt: string;
    transactionHash: string;
  }>> {
    try {
      const mintRecords = await this.vault.getAllMintRecords();
      return mintRecords.map((record: MintRecord) => ({
        tokenId: parseInt(record.tokenId),
        ownerAddress: record.userAddress,
        ownerWalletId: record.userWalletId,
        metadata: record.metadata,
        mintedAt: record.mintedAt,
        transactionHash: record.transactionHash
      }));
    } catch (error) {
      console.error('Error fetching mint records:', error);
      return [];
    }
  }

  /**
   * Get contract info
   */
  async getContractInfo(): Promise<{
    address: string;
    name?: string;
    symbol?: string;
    totalSupply?: number;
    adminAddress: string;
  }> {
    try {
      const adminWallet = new ethers.Wallet(this.deployerPrivateKey, this.provider);
      const nftContract = new ethers.Contract(
        this.contractAddress,
        SOULBOUND_ABI,
        adminWallet
      );

      let name, symbol, totalSupply;

      try {
        name = await nftContract.name();
        symbol = await nftContract.symbol();
        totalSupply = (await nftContract.totalSupply()).toString();
      } catch (error) {
        console.log('⚠️ Could not fetch some contract details');
      }

      return {
        address: this.contractAddress,
        name,
        symbol,
        totalSupply: totalSupply ? parseInt(totalSupply) : undefined,
        adminAddress: adminWallet.address
      };
    } catch (error) {
      console.error('Error fetching contract info:', error);
      return {
        address: this.contractAddress,
        adminAddress: this.getAdminAddress()
      };
    }
  }

  /**
   * Upload metadata to IPFS (simplified - you can implement with Pinata or NFT.Storage)
   */
  private async uploadMetadata(metadata: NFTMetadata): Promise<string> {
    // For production, upload to IPFS and return the URI
    // Example using Pinata or NFT.Storage
    
    // For demo, return a mock URI with timestamp
    const mockURI = `ipfs://QmMock${Date.now()}/metadata.json`;
    
    // You could also store metadata in your vault
    await this.vault.storeMetadata(mockURI, metadata);
    
    return mockURI;
  }
}