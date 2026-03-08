import { Router } from 'express';
import { AuthService } from '../auth/AuthService';
import { authMiddleware } from './middleware';

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

  return router;
}