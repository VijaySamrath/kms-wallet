import { Router } from 'express';
import { AuthService } from '../auth/AuthService';
import { authMiddleware } from './middleware';
import { NFTService } from '../services/NFTService';

const authService = new AuthService();

export function createRouter(): Router {
  const router = Router();

  // Public routes
  router.post('/auth/register', async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      const result = await authService.register(email, password);
      
      if (result.success) {
        res.json({ success: true, userId: result.userId });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      const result = await authService.login(email, password);
      
      if (result.success && result.sessionId) {
        req.session.userId = result.userId;
        req.session.sessionId = result.sessionId;
        
        res.json({
          success: true,
          userId: result.userId,
          wallets: result.wallets,
          sessionId: result.sessionId
        });
      } else {
        res.status(401).json({ success: false, error: result.error });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Protected routes
  router.post('/wallets', authMiddleware, async (req, res) => {
    try {
      const { userId, sessionId } = req.session;
      
      if (!userId || !sessionId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const result = await authService.createWallet(userId, sessionId);
      
      if (result.success) {
        res.json({
          success: true,
          walletId: result.walletId,
          publicAddress: result.publicAddress
        });
      } else {
        res.status(400).json({ success: false, error: 'Failed to create wallet' });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/wallets', authMiddleware, async (req, res) => {
    try {
      const { userId } = req.session;
      
      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      // Get wallets from Vault
      const vault = new (require('../vault/VaultService').VaultService)();
      const wallets = await vault.getUserWallets(userId);
      
      res.json({
        success: true,
        wallets: wallets.map((w: { walletId: any; publicAddress: any; createdAt: any; }) => ({
          walletId: w.walletId,
          publicAddress: w.publicAddress,
          createdAt: w.createdAt
        }))
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/transactions/sign', authMiddleware, async (req, res) => {
    try {
      const { userId, sessionId } = req.session;
      const { walletId, transaction } = req.body;
      
      if (!userId || !sessionId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      if (!walletId || !transaction) {
        return res.status(400).json({ error: 'Wallet ID and transaction required' });
      }

      const result = await authService.signTransaction(
        userId,
        sessionId,
        walletId,
        transaction
      );
      
      if (result.success) {
        res.json({
          success: true,
          signedTx: result.signedTx
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/auth/logout', authMiddleware, async (req, res) => {
    try {
      const { userId, sessionId } = req.session;
      
      if (userId && sessionId) {
        await authService.logout(userId, sessionId);
      }

      req.session.destroy((err) => {
        if (err) {
          console.error('Session destruction error:', err);
        }
        res.json({ success: true });
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/session/status', authMiddleware, (req, res) => {
    res.json({
      authenticated: true,
      userId: req.session.userId,
      sessionId: req.session.sessionId
    });
  });


  /**
   * Get contract info - PUBLIC
   */
  router.get('/nft/info', async (req, res) => {
    try {
      const nftService = new NFTService();
      const info = await nftService.getContractInfo();
      
      res.json({
        success: true,
        contract: info
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Mint NFT to a specific wallet - PUBLIC
   */
  router.post('/nft/mint/:userWalletId', async (req, res) => {
    try {
      const { userWalletId } = req.params;
      const metadata = req.body;
      
      if (!metadata || !metadata.name || !metadata.description) {
        return res.status(400).json({ 
          error: 'Metadata required with at least name and description' 
        });
      }

      const nftService = new NFTService();
      const result = await nftService.mintNFT(userWalletId, metadata);
      
      if (result.success) {
        res.json({
          success: true,
          tokenId: result.tokenId,
          transactionHash: result.transactionHash,
          message: `✅ Soulbound NFT minted successfully!`,
          explorerUrl: `https://sepolia.etherscan.io/tx/${result.transactionHash}`
        });
      } else {
        res.status(400).json({ 
          success: false, 
          error: result.error 
        });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Batch mint to multiple wallets - PUBLIC
   */
  router.post('/nft/mint-batch', async (req, res) => {
    try {
      const { walletIds, metadata } = req.body;
      
      if (!walletIds || !Array.isArray(walletIds) || walletIds.length === 0) {
        return res.status(400).json({ error: 'walletIds array required' });
      }
      
      if (!metadata) {
        return res.status(400).json({ error: 'metadata required' });
      }

      const nftService = new NFTService();
      const results = await nftService.mintNFTBatch(walletIds, metadata);
      
      res.json({
        success: results.success,
        total: walletIds.length,
        successful: results.results.filter(r => r.success).length,
        failed: results.results.filter(r => !r.success).length,
        results: results.results
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Check if user has NFT - PUBLIC
   */
  router.get('/nft/check/:userWalletId', async (req, res) => {
    try {
      const { userWalletId } = req.params;
      
      const nftService = new NFTService();
      const result = await nftService.checkUserNFT(userWalletId);
      
      res.json({
        success: true,
        hasNFT: result.hasNFT,
        tokenId: result.tokenId,
        metadata: result.metadata,
        contractAddress: result.contractAddress
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get all minted NFTs - PUBLIC
   */
  router.get('/nft/all', async (req, res) => {
    try {
      const nftService = new NFTService();
      const nfts = await nftService.getAllMintedNFTs();
      
      res.json({
        success: true,
        count: nfts.length,
        nfts
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // AUTH ROUTES - STILL PROTECTED
  // ============================================

  /**
   * Register user - PUBLIC (needed for creating accounts)
   */
  router.post('/auth/register', async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      const result = await authService.register(email, password);
      
      if (result.success) {
        res.json({ success: true, userId: result.userId });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Login user - PUBLIC
   */
  router.post('/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      const result = await authService.login(email, password);
      
      if (result.success && result.sessionId) {
        req.session.userId = result.userId;
        req.session.sessionId = result.sessionId;
        
        res.json({
          success: true,
          userId: result.userId,
          wallets: result.wallets,
          sessionId: result.sessionId
        });
      } else {
        res.status(401).json({ success: false, error: result.error });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Logout user - PROTECTED (needs session)
   */
  router.post('/auth/logout', authMiddleware, async (req, res) => {
    try {
      const { userId, sessionId } = req.session;
      
      if (userId && sessionId) {
        await authService.logout(userId, sessionId);
      }

      req.session.destroy((err) => {
        if (err) {
          console.error('Session destruction error:', err);
        }
        res.json({ success: true });
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // WALLET ROUTES - PROTECTED (need user session)
  // ============================================

  /**
   * Create wallet - PROTECTED (needs user session)
   */
  router.post('/wallets', authMiddleware, async (req, res) => {
    try {
      const { userId, sessionId } = req.session;
      
      if (!userId || !sessionId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const result = await authService.createWallet(userId, sessionId);
      
      if (result.success) {
        res.json({
          success: true,
          walletId: result.walletId,
          publicAddress: result.publicAddress
        });
      } else {
        res.status(400).json({ success: false, error: 'Failed to create wallet' });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * List wallets - PROTECTED (needs user session)
   */
  router.get('/wallets', authMiddleware, async (req, res) => {
    try {
      const { userId } = req.session;
      
      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { VaultService } = await import('../vault/VaultService');
      const vault = new VaultService();
      const wallets = await vault.getUserWallets(userId);
      
      res.json({
        success: true,
        wallets: wallets.map(w => ({
          walletId: w.walletId,
          publicAddress: w.publicAddress,
          createdAt: w.createdAt
        }))
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Sign transaction - PROTECTED (needs user session)
   */
  router.post('/transactions/sign', authMiddleware, async (req, res) => {
    try {
      const { userId, sessionId } = req.session;
      const { walletId, transaction } = req.body;
      
      if (!userId || !sessionId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      if (!walletId || !transaction) {
        return res.status(400).json({ error: 'Wallet ID and transaction required' });
      }

      const result = await authService.signTransaction(
        userId,
        sessionId,
        walletId,
        transaction
      );
      
      if (result.success) {
        res.json({
          success: true,
          signedTx: result.signedTx
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Session status - PUBLIC
   */
  router.get('/session/status', (req, res) => {
    if (req.session.userId && req.session.sessionId) {
      res.json({
        authenticated: true,
        userId: req.session.userId,
        sessionId: req.session.sessionId
      });
    } else {
      res.json({
        authenticated: false
      });
    }
  });

  return router;
}