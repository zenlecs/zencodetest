import crypto from "crypto";
// Ephemeral WS Ticket Cache (Single-use, expires in 30s)
export const wsTicketCache = new Map<string, { userId: number; username: string; expiresAt: number }>();

// Clean expired tickets periodically
setInterval(() => {
  const now = Date.now();
  wsTicketCache.forEach((data, ticket) => {
    if (data.expiresAt < now) wsTicketCache.delete(ticket);
  });
}, 60000);

import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import { NotificationEngine } from "./services/notification-engine";
import { zenVault } from "./services/zen-vault";
import { studioEngine } from "./services/studio-engine";
import { computeStatutoryDeadlines } from "./services/deadline-engine";
import {
  buildDefenseDraft,
  checkCitations,
  decideApproval,
  listApprovals,
  maskPii,
  matterTree,
  addMatterFolder,
  addMatterFile,
  moveMatterFile,
  addMatterNote,
  openGraph,
  presentationBrief,
  readMailbox,
  recordDossierFile,
  runWorkflow,
  saveConnectorToken,
  sealGraph,
  searchPrecedents,
  stopRun,
  tryVaultStore,
} from "./services/studio-automation";
import { zeniumEngine } from "./services/zenium-browser";
import { signalCoordinator } from "./services/signal-protocol";
import { zenlecsAI, resolveAIModel, resolveRotationModel, describeAIError } from "./services/zenlecs-ai";
import { log } from "./index";
import { setupWebSocket } from "./websocket";
import { db } from "./db";
import * as cheerio from "cheerio";
import { messages, conversations, contacts } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  insertWalletSchema,
  insertTransactionSchema,
  insertCaseSchema,
  insertDocumentSchema,
  insertContactSchema,
  insertMessageSchema,
  insertConversationSchema,
  insertAccountingEntrySchema,
  insertCallSessionSchema,
  insertPresentationSchema,
  insertSlideSchema,
  insertSlideElementSchema,
  insertAIJobSchema,
  insertAIConversationSchema,
  insertAIChatMessageSchema,
} from "@shared/schema";
import { z } from "zod";
import {
  rateLimit,
  authenticate,
  optionalAuth,
  csrfProtection,
  register,
  loginZKA,
  getUserVault,
  logout,
  getSessionCookieOptions,
  SESSION_COOKIE,
} from "./auth";
import multer from "multer";

// File upload configuration
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});

// Validation schemas for ZKA authentication
const registerSchema = z.object({
  username: z.string({ required_error: "username_required" }).optional().nullable(),
  authKey: z.string({ required_error: "authKey_required" }).min(1, "AuthKey gerekli"),
  publicKey: z.string({ required_error: "publicKey_required" }).min(1, "PublicKey gerekli"),
  vaultPayload: z.string({ required_error: "vaultPayload_required" }).min(1, "VaultPayload gerekli"),
  displayName: z.string().optional(),
  email: z.string().email("Geçerli bir e-posta adresi girin").optional().or(z.literal("")),
  phone: z.string().optional(),
  isAnonymous: z.boolean().optional(),
  barAssociationNumber: z.string().optional(),
  city: z.string().optional(),
  specializations: z.array(z.string()).optional(),
});

const loginSchema = z.object({
  identifier: z.string().min(1, "Kullanıcı adı veya E-posta gerekli"),
  authKey: z.string().min(1, "AuthKey gerekli"),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Mevcut şifre gerekli"),
  newPassword: z.string().min(8, "Yeni şifre en az 8 karakter olmalı"),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Add cookie parser middleware
  app.use(cookieParser());
  
  // Apply CSRF protection globally
  app.use(csrfProtection);

  // Serve static assets
  const assetsDir = path.join(process.cwd(), "attached_assets");
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }
  app.use("/assets", (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && process.env.ZENOS_LOOPBACK_SECRET) {
      const token = authHeader.replace(/^Bearer\s+/i, "");
      
      if (
        token.length === process.env.ZENOS_LOOPBACK_SECRET.length &&
        crypto.timingSafeEqual(Buffer.from(token), Buffer.from(process.env.ZENOS_LOOPBACK_SECRET))
      ) {
        return next();
      }
    }
    return authenticate(req, res, next);
  }, express.static(assetsDir));

  // ========== AUTH ROUTES ==========

  // Get CSRF token (called first before any state-changing requests)
  // Ephemeral WS single-use ticket for authenticated clients
  app.post("/api/auth/ws-ticket", authenticate, (req, res) => {
    
    const ticket = crypto.randomBytes(32).toString("hex");
    wsTicketCache.set(ticket, {
      userId: req.user!.id,
      username: req.user!.username || "Unknown",
      expiresAt: Date.now() + 30000,
    });
    res.json({ ticket });
  });

  app.get("/api/auth/csrf", (req, res) => {
    res.json({ csrfToken: req.csrfToken });
  });

  // Get ZK Vault for login
  app.get("/api/auth/vault", async (req, res) => {
    try {
      const identifier = req.query.identifier as string;
      if (!identifier) {
        return res.status(400).json({ error: "E-posta veya kullanıcı adı gerekli." });
      }
      const vaultPayload = await getUserVault(identifier);
      if (!vaultPayload) {
        return res.status(404).json({ error: "Kullanıcı bulunamadı veya kasa mevcut değil." });
      }
      res.json({ vaultPayload });
    } catch (error) {
      res.status(500).json({ error: "Kasa alınırken hata oluştu." });
    }
  });

  // Register - saves ZK Vault
  app.post("/api/auth/register", rateLimit, async (req, res) => {
    try {
      const parsed = registerSchema.parse(req.body);
      const { user } = await register({
        username: parsed.username,
        authKey: parsed.authKey,
        publicKey: parsed.publicKey,
        vaultPayload: parsed.vaultPayload,
        displayName: parsed.displayName,
        email: parsed.email || undefined,
        phone: parsed.phone,
        isAnonymous: parsed.isAnonymous,
        barAssociationNumber: parsed.barAssociationNumber,
        city: parsed.city,
        specializations: parsed.specializations,
      });

      res.status(201).json({ message: "Kayıt başarılı. Lütfen giriş yapın." });
    } catch (error) {
      console.error("REGISTER ERROR:", error);
      if (error instanceof z.ZodError) {
        console.error("Zod Error Details:", JSON.stringify(error.errors, null, 2));
        return res.status(400).json({ error: error.errors });
      }
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Kayıt işlemi başarısız oldu." });
    }
  });

  // Login - ZKA AuthKey verification
  app.post("/api/auth/login", rateLimit, async (req, res) => {
    try {
      const parsed = loginSchema.parse(req.body);
      const { user, token } = await loginZKA(
        parsed.identifier,
        parsed.authKey,
        req.ip,
        req.get("User-Agent")
      );

      // Create login notification
      const now = new Date();
      const dateStr = now.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const timeStr = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      await storage.createNotification({
        userId: user.id,
        type: 'login',
        title: 'Yeni Giriş',
        message: `${dateStr} ${timeStr} tarihinde giriş yapıldı`,
        icon: 'log-in',
        isRead: false,
        metadata: { ip: req.ip, userAgent: req.get("User-Agent"), timestamp: now.toISOString() },
      });

      res.cookie(SESSION_COOKIE, token, getSessionCookieOptions());
      res.json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          avatar: user.avatar,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      if (error instanceof Error) {
        return res.status(401).json({ error: error.message });
      }
      res.status(500).json({ error: "Giriş işlemi başarısız oldu." });
    }
  });

  // Logout
  app.post("/api/auth/logout", authenticate, async (req, res) => {
    try {
      if (req.session) {
        await logout(req.session.id);
      }
      res.clearCookie(SESSION_COOKIE);
      res.json({ message: "Çıkış yapıldı." });
    } catch (error) {
      res.status(500).json({ error: "Çıkış işlemi başarısız oldu." });
    }
  });

  // Get current user
  app.get("/api/auth/me", optionalAuth, async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ error: "Oturum açılmamış." });
    }

    try {
      const profile = await storage.getUserProfile(req.user.id);
      const settings = await storage.getUserSettings(req.user.id);

      let vaultId = "";
      if (req.user.vaultPayload) {
        try {
          const payload = JSON.parse(req.user.vaultPayload);
          vaultId = payload.vaultId || "";
        } catch (e) {}
      }

      res.json({
        user: {
          id: req.user.id,
          username: req.user.username,
          vaultId: vaultId,
          email: req.user.email,
          displayName: req.user.displayName,
          role: req.user.role,
          avatar: req.user.avatar,
          phone: req.user.phone,
          createdAt: req.user.createdAt,
          lastLoginAt: req.user.lastLoginAt,
          twoFactorEnabled: req.user.twoFactorEnabled,
        },
        profile,
        settings,
      });
    } catch (error) {
      res.status(500).json({ error: "Kullanıcı bilgileri alınamadı." });
    }
  });

  // Change password
  app.post("/api/auth/change-password", authenticate, rateLimit, async (req, res) => {
    try {
      const parsed = changePasswordSchema.parse(req.body);
      // await changePassword(req.user!.id, parsed.currentPassword, parsed.newPassword);
      res.clearCookie(SESSION_COOKIE);
      res.json({ message: "Şifre değiştirildi. Lütfen tekrar giriş yapın." });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Şifre değiştirme işlemi başarısız oldu." });
    }
  });

  // Update profile
  app.patch("/api/auth/profile", authenticate, async (req, res) => {
    try {
      const profile = await storage.updateUserProfile(req.user!.id, req.body);
      res.json(profile);
    } catch (error) {
      res.status(500).json({ error: "Profil güncellenemedi." });
    }
  });

  // Set Alias
  app.post("/api/auth/alias", authenticate, async (req, res) => {
    try {
      const { username } = req.body;
      if (!username || !/^[a-zA-Z0-9]{4,20}$/.test(username)) {
        return res.status(400).json({ error: "Kullanıcı adı 4-20 karakter uzunluğunda olmalı ve sadece İngilizce harfler ile rakamlar içerebilir." });
      }
      const updatedUser = await storage.setAlias(req.user!.id, username);
      res.json(updatedUser);
    } catch (error) {
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Kullanıcı adı ayarlanamadı." });
    }
  });

  // Update settings
  app.patch("/api/auth/settings", authenticate, async (req, res) => {
    try {
      const settings = await storage.updateUserSettings(req.user!.id, req.body);
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Ayarlar güncellenemedi." });
    }
  });

  // Search users by alias
  app.get("/api/users/search", authenticate, async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query || query.length < 2) {
        return res.json([]);
      }
      const users = await storage.searchUsersByAlias(query, req.user!.id);
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: "Kullanıcı araması başarısız oldu." });
    }
  });

  // ========== WALLET ROUTES ==========

  app.get("/api/wallets", authenticate, async (req, res) => {
    try {
      const wallets = await storage.getWallets(req.user!.id);
      res.json(wallets);
    } catch (error) {
      res.status(500).json({ error: "Cüzdanlar yüklenemedi." });
    }
  });

  app.get("/api/wallets/:id", authenticate, async (req, res) => {
    try {
      const wallet = await storage.getWallet(parseInt(req.params.id));
      if (!wallet || wallet.userId !== req.user!.id) {
        return res.status(404).json({ error: "Cüzdan bulunamadı." });
      }
      res.json(wallet);
    } catch (error) {
      res.status(500).json({ error: "Cüzdan yüklenemedi." });
    }
  });

  app.post("/api/wallets", authenticate, async (req, res) => {
    try {
      const parsed = insertWalletSchema.parse({ ...req.body, userId: req.user!.id });
      const wallet = await storage.createWallet(parsed);
      res.status(201).json(wallet);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Cüzdan oluşturulamadı." });
    }
  });

  app.patch("/api/wallets/:id", authenticate, async (req, res) => {
    try {
      const wallet = await storage.getWallet(parseInt(req.params.id));
      if (!wallet || wallet.userId !== req.user!.id) {
        return res.status(404).json({ error: "Cüzdan bulunamadı." });
      }
      const updated = await storage.updateWallet(parseInt(req.params.id), req.body);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Cüzdan güncellenemedi." });
    }
  });

  app.delete("/api/wallets/:id", authenticate, async (req, res) => {
    try {
      const wallet = await storage.getWallet(parseInt(req.params.id));
      if (!wallet || wallet.userId !== req.user!.id) {
        return res.status(404).json({ error: "Cüzdan bulunamadı." });
      }
      await storage.deleteWallet(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Cüzdan silinemedi." });
    }
  });

  // ========== TRANSACTION ROUTES ==========

  app.get("/api/wallets/:id/transactions", authenticate, async (req, res) => {
    try {
      const wallet = await storage.getWallet(parseInt(req.params.id));
      if (!wallet || wallet.userId !== req.user!.id) {
        return res.status(404).json({ error: "Cüzdan bulunamadı." });
      }
      const transactions = await storage.getTransactions(parseInt(req.params.id));
      res.json(transactions);
    } catch (error) {
      res.status(500).json({ error: "İşlemler yüklenemedi." });
    }
  });

  app.post("/api/transactions", authenticate, async (req, res) => {
    try {
      const parsed = insertTransactionSchema.parse(req.body);
      const wallet = await storage.getWallet(parsed.walletId);
      if (!wallet || wallet.userId !== req.user!.id) {
        return res.status(404).json({ error: "Cüzdan bulunamadı." });
      }
      const transaction = await storage.createTransaction(parsed);
      
      // Create notification for wallet transaction
      const typeLabel = parsed.type === 'income' ? 'Gelir' : parsed.type === 'expense' ? 'Gider' : 'Transfer';
      await storage.createNotification({
        userId: req.user!.id,
        type: 'wallet_transaction',
        title: `${(wallet as any).name} - ${typeLabel}`,
        message: `${(parsed as any).amount} ${wallet.currency} ${(parsed as any).description}`,
        icon: 'wallet',
        isRead: false,
        metadata: { transactionId: transaction.id, walletId: wallet.id, amount: (parsed as any).amount, type: parsed.type },
      });
      
      res.status(201).json(transaction);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "İşlem oluşturulamadı." });
    }
  });

  // ========== CASE ROUTES ==========

  app.get("/api/cases", authenticate, async (req, res) => {
    try {
      const cases = await storage.getCases(req.user!.id);
      res.json(cases);
    } catch (error) {
      res.status(500).json({ error: "Davalar yüklenemedi." });
    }
  });

  app.get("/api/cases/:id", authenticate, async (req, res) => {
    try {
      const caseData = await storage.getCase(parseInt(req.params.id));
      if (!caseData || caseData.userId !== req.user!.id) {
        return res.status(404).json({ error: "Dava bulunamadı." });
      }
      res.json(caseData);
    } catch (error) {
      res.status(500).json({ error: "Dava yüklenemedi." });
    }
  });

  app.post("/api/cases", authenticate, async (req, res) => {
    try {
      const parsed = insertCaseSchema.parse({ ...req.body, userId: req.user!.id });
      const caseData = await storage.createCase(parsed);
      res.status(201).json(caseData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Dava oluşturulamadı." });
    }
  });

  app.patch("/api/cases/:id", authenticate, async (req, res) => {
    try {
      const caseData = await storage.getCase(parseInt(req.params.id));
      if (!caseData || caseData.userId !== req.user!.id) {
        return res.status(404).json({ error: "Dava bulunamadı." });
      }
      const updated = await storage.updateCase(parseInt(req.params.id), req.body);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Dava güncellenemedi." });
    }
  });

  app.delete("/api/cases/:id", authenticate, async (req, res) => {
    try {
      const caseData = await storage.getCase(parseInt(req.params.id));
      if (!caseData || caseData.userId !== req.user!.id) {
        return res.status(404).json({ error: "Dava bulunamadı." });
      }
      await storage.deleteCase(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Dava silinemedi." });
    }
  });

  // ========== DOCUMENT ROUTES ==========

  app.get("/api/documents", authenticate, async (req, res) => {
    try {
      const caseId = req.query.caseId ? parseInt(req.query.caseId as string) : undefined;
      const documents = await storage.getDocuments(req.user!.id, caseId);
      res.json(documents);
    } catch (error) {
      res.status(500).json({ error: "Belgeler yüklenemedi." });
    }
  });

  app.get("/api/documents/:id", authenticate, async (req, res) => {
    try {
      const document = await storage.getDocument(parseInt(req.params.id));
      if (!document || document.userId !== req.user!.id) {
        return res.status(404).json({ error: "Belge bulunamadı." });
      }
      res.json(document);
    } catch (error) {
      res.status(500).json({ error: "Belge yüklenemedi." });
    }
  });

  app.post("/api/documents", authenticate, async (req, res) => {
    try {
      const parsed = insertDocumentSchema.parse({ ...req.body, userId: req.user!.id });
      const document = await storage.createDocument(parsed);
      res.status(201).json(document);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Belge oluşturulamadı." });
    }
  });

  app.patch("/api/documents/:id", authenticate, async (req, res) => {
    try {
      const document = await storage.getDocument(parseInt(req.params.id));
      if (!document || document.userId !== req.user!.id) {
        return res.status(404).json({ error: "Belge bulunamadı." });
      }
      const updated = await storage.updateDocument(parseInt(req.params.id), req.body);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Belge güncellenemedi." });
    }
  });

  app.delete("/api/documents/:id", authenticate, async (req, res) => {
    try {
      const document = await storage.getDocument(parseInt(req.params.id));
      if (!document || document.userId !== req.user!.id) {
        return res.status(404).json({ error: "Belge bulunamadı." });
      }
      await storage.deleteDocument(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Belge silinemedi." });
    }
  });

  // ========== CONTACT ROUTES ==========

  app.get("/api/contacts", authenticate, async (req, res) => {
    try {
      const userContacts = await storage.getContacts(req.user!.id);
      // Fetch target usernames
      const enrichedContacts = await Promise.all(userContacts.map(async (contact) => {
        if (contact.targetUserId) {
          const targetUser = await storage.getUser(contact.targetUserId);
          return { ...contact, targetUsername: targetUser?.username || `Kullanıcı ${contact.targetUserId}` };
        }
        return contact;
      }));
      res.json(enrichedContacts);
    } catch (error) {
      res.status(500).json({ error: "Kişiler yüklenemedi." });
    }
  });

  app.get("/api/contacts/:id", authenticate, async (req, res) => {
    try {
      const contact = await storage.getContact(parseInt(req.params.id));
      if (!contact || contact.userId !== req.user!.id) {
        return res.status(404).json({ error: "Kişi bulunamadı." });
      }
      res.json(contact);
    } catch (error) {
      res.status(500).json({ error: "Kişi yüklenemedi." });
    }
  });

  app.post("/api/contacts", authenticate, async (req, res) => {
    try {
      const parsed = insertContactSchema.parse({ ...req.body, userId: req.user!.id });
      const contact = await storage.createContact(parsed);
      res.status(201).json(contact);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Kişi oluşturulamadı." });
    }
  });

  app.patch("/api/contacts/:id", authenticate, async (req, res) => {
    try {
      const contact = await storage.getContact(parseInt(req.params.id));
      if (!contact || contact.userId !== req.user!.id) {
        return res.status(404).json({ error: "Kişi bulunamadı." });
      }
      const updated = await storage.updateContact(parseInt(req.params.id), req.body);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Kişi güncellenemedi." });
    }
  });

  app.delete("/api/contacts/:id", authenticate, async (req, res) => {
    try {
      const contact = await storage.getContact(parseInt(req.params.id));
      if (!contact || contact.userId !== req.user!.id) {
        return res.status(404).json({ error: "Kişi bulunamadı." });
      }
      await storage.deleteContact(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Kişi silinemedi." });
    }
  });

  // ========== CONVERSATION ROUTES ==========

  app.get("/api/conversations", authenticate, async (req, res) => {
    try {
      const conversations = await storage.getConversations(req.user!.id.toString());
      res.json(conversations);
    } catch (error) {
      res.status(500).json({ error: "Sohbetler yüklenemedi." });
    }
  });

  app.get("/api/conversations/:id", authenticate, async (req, res) => {
    try {
      const conversation = await storage.getConversation(parseInt(req.params.id));
      if (!conversation) {
        return res.status(404).json({ error: "Sohbet bulunamadı." });
      }
      res.json(conversation);
    } catch (error) {
      res.status(500).json({ error: "Sohbet yüklenemedi." });
    }
  });

  app.post("/api/conversations", authenticate, async (req, res) => {
    try {
      const parsed = insertConversationSchema.parse(req.body);
      const conversation = await storage.createConversation(parsed);
      res.status(201).json(conversation);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Sohbet oluşturulamadı." });
    }
  });

  app.post("/api/conversations/direct", authenticate, async (req, res) => {
    try {
      const { targetUserId, targetPublicKey, userPublicKey } = req.body;
      if (!targetUserId) {
        return res.status(400).json({ error: "Hedef kullanıcı ID'si gerekli." });
      }
      
      // Check if conversation already exists between these two users
      const conversations = await storage.getConversations(req.user!.id.toString());
      const existing = conversations.find(c => 
        c.participants.includes(req.user!.id.toString()) && 
        c.participants.includes(targetUserId.toString()) && 
        c.participants.length === 2
      );

      if (existing) {
        // Ensure contact exists for current user (fixes state from previous failed attempts)
        const contacts = await storage.getContacts(req.user!.id);
        const contactExists = contacts.find(c => c.targetUserId == targetUserId);
        if (!contactExists) {
            await storage.createContact({
                userId: req.user!.id,
                targetUserId: parseInt(targetUserId),
                encryptedData: "{}",
                nameBlindIndex: "auto_contact_" + targetUserId,
                status: "online",
                publicKey: targetPublicKey
            } as any);
        }
        return res.json(existing);
      }

      const conversation = await storage.createDirectConversation(
        req.user!.id, 
        parseInt(targetUserId), 
        targetPublicKey, 
        userPublicKey
      );
      
      res.status(201).json(conversation);
    } catch (error) {
      res.status(500).json({ error: "Sohbet başlatılamadı." });
    }
  });

  // ========== MESSAGE ROUTES ==========

  app.get("/api/conversations/:id/messages", authenticate, async (req, res) => {
    try {
      const messages = await storage.getMessages(parseInt(req.params.id));
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: "Mesajlar yüklenemedi." });
    }
  });

  app.post("/api/conversations/:id/archive", authenticate, async (req, res) => {
    try {
      const convId = parseInt(req.params.id);
      const userId = req.user!.id.toString();
      
      const [conversation] = await db.select().from(conversations).where(eq(conversations.id, convId));
      if (!conversation) return res.status(404).json({ error: "Sohbet bulunamadı." });
      
      let archivedBy = [...(conversation.archivedBy || [])];
      if (archivedBy.includes(userId)) {
        archivedBy = archivedBy.filter(id => id !== userId);
      } else {
        archivedBy.push(userId);
      }
      
      await db.update(conversations).set({ archivedBy }).where(eq(conversations.id, convId));
      res.json({ success: true, archived: archivedBy.includes(userId) });
    } catch (error) {
      res.status(500).json({ error: "İşlem başarısız." });
    }
  });

  app.post("/api/conversations/:id/delete", authenticate, async (req, res) => {
    try {
      const convId = parseInt(req.params.id);
      const userId = req.user!.id.toString();
      
      const [conversation] = await db.select().from(conversations).where(eq(conversations.id, convId));
      if (!conversation) return res.status(404).json({ error: "Sohbet bulunamadı." });
      
      let deletedBy = [...(conversation.deletedBy || [])];
      if (!deletedBy.includes(userId)) {
        deletedBy.push(userId);
      }
      
      await db.update(conversations).set({ deletedBy }).where(eq(conversations.id, convId));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "İşlem başarısız." });
    }
  });

  app.post("/api/contacts/:id/block", authenticate, async (req, res) => {
    try {
      const contactId = parseInt(req.params.id);
      
      const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId));
      if (!contact) return res.status(404).json({ error: "Kişi bulunamadı." });
      
      // Verify ownership
      if (contact.userId !== req.user!.id) {
        return res.status(403).json({ error: "Yetkisiz işlem." });
      }

      await db.update(contacts).set({ isBlocked: !contact.isBlocked }).where(eq(contacts.id, contactId));
      res.json({ success: true, blocked: !contact.isBlocked });
    } catch (error) {
      res.status(500).json({ error: "İşlem başarısız." });
    }
  });

  // ========== ZENVAULT STEEL CONTAINER ROUTES ==========

  app.get("/api/vault/status", authenticate, async (_req, res) => {
    try {
      res.json(zenVault.getStatus());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Explicit administrative endpoint to claim/migrate legacy blobs
  app.post("/api/vault/migrate-legacy", authenticate, async (req, res) => {
    try {
      // Only system administrators or user ID 1 can trigger legacy blob migration
      if (req.user!.role !== "admin" && req.user!.id !== 1) {
        return res.status(403).json({ error: "Only administrators can perform legacy vault migrations." });
      }
      const targetUserId = req.body.targetUserId || req.user!.id;
      const result = zenVault.migrateLegacyBlobs(targetUserId);
      return res.json({ success: true, ...result });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Migration failed" });
    }
  });

  app.post("/api/vault/unlock", rateLimit({ windowMs: 15 * 60 * 1000, max: 5 }), authenticate, async (req, res) => {
    try {
      const { passphrase } = req.body;
      if (!passphrase) {
        return res.status(400).json({ error: "Passphrase is required to unlock ZenVault" });
      }
      await zenVault.unlock(passphrase);
      res.json({ success: true, status: zenVault.getStatus() });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/vault/lock", authenticate, async (_req, res) => {
    try {
      zenVault.lock();
      res.json({ success: true, status: zenVault.getStatus() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/upload", authenticate, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Hardened Vault Rule: No plaintext disk leaks.
      // If ZenVault is locked, reject upload with 423 Locked instead of storing plaintext on disk.
      const vaultStatus = zenVault.getStatus();
      if (!vaultStatus.isUnlocked) {
        return res.status(423).json({ 
          error: "ZenVault is locked. Unlock the encrypted steel vault before uploading documents." 
        });
      }

      const blobId = zenVault.encryptAndStore(req.file.buffer, {
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        uploadedAt: new Date().toISOString(),
        userId: req.user!.id,
      });

      return res.json({
        vault: true,
        blobId,
        url: `/api/vault/blobs/${blobId}`,
        filename: req.file.originalname,
      });
    } catch (err) {
      console.error("Upload error:", err);
      res.status(500).json({ error: "Upload failed" });
    }
  });

  // ========== SIGNAL-GRADE E2E SESSION COORDINATOR ROUTES ==========
  // Zero-Knowledge: Server NEVER receives private keys or plaintext messages.
  // All Diffie-Hellman derivation & message encryption happen client-side.

  app.post("/api/signal/session/init", authenticate, async (req, res) => {
    try {
      const { sessionId, initiatorPublicKey } = req.body;
      if (!sessionId || !initiatorPublicKey) {
        return res.status(400).json({ error: "sessionId and initiatorPublicKey are required" });
      }

      const session = signalCoordinator.createSession(sessionId, req.user!.id, initiatorPublicKey);
      res.json(session);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/signal/session/join", authenticate, async (req, res) => {
    try {
      const { sessionId, responderPublicKey } = req.body;
      if (!sessionId || !responderPublicKey) {
        return res.status(400).json({ error: "sessionId and responderPublicKey are required" });
      }

      const session = signalCoordinator.joinSession(sessionId, req.user!.id, responderPublicKey);
      res.json(session);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/signal/session/:sessionId/public-key", authenticate, async (req, res) => {
    try {
      const remoteKey = signalCoordinator.getRemotePublicKey(req.params.sessionId, req.user!.id);
      if (!remoteKey) {
        return res.status(404).json({ error: "Remote public key not found or not authorized" });
      }
      res.json({ remotePublicKey: remoteKey });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/signal/session/:sessionId", authenticate, async (req, res) => {
    try {
      const session = signalCoordinator.getSession(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      if (session.initiatorId !== req.user!.id && session.responderId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied: Not a participant of this E2E session" });
      }
      signalCoordinator.closeSession(req.params.sessionId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/signal/sessions", authenticate, async (req, res) => {
    try {
      res.json(signalCoordinator.listSessions(req.user!.id));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== STUDIO WORKPLACE ROUTES ==========

  // 1. Get User's NeoGraph Canvas State
  app.get("/api/studio/graph", authenticate, async (req, res) => {
    try {
      const state = await storage.getStudioGraphState(req.user!.id);
      if (!state) {
        return res.json({
          title: "Universal Legal Canvas",
          graphData: null,
        });
      }
      const opened = openGraph(state.graphData);
      if (opened.migrated) {
        await storage.saveStudioGraphState(req.user!.id, sealGraph(opened.text), state.title);
      }
      res.json({ ...state, graphData: opened.text });
    } catch (err: any) {
      console.error("[Studio] Get graph error:", err);
      res.status(500).json({ error: err.message || "Failed to load canvas state" });
    }
  });

  // 2. Save User's NeoGraph Canvas State
  app.post("/api/studio/graph", authenticate, async (req, res) => {
    try {
      const { graphData, title } = req.body;
      if (!graphData) {
        return res.status(400).json({ error: "graphData is required" });
      }

      const stringData = typeof graphData === "string" ? graphData : JSON.stringify(graphData);
      const saved = await storage.saveStudioGraphState(req.user!.id, sealGraph(stringData), title);
      res.json({ ...saved, graphData: stringData });
    } catch (err: any) {
      console.error("[Studio] Save graph error:", err);
      res.status(500).json({ error: err.message || "Failed to persist canvas state" });
    }
  });

  // 3. Universal Legal Document Ingestion & Parser (UDF, Akoma Ntoso, XJustiz, PACER/RECAP, ECF, PDF/A)
  app.post("/api/studio/parse-legal-doc", authenticate, upload.single("file"), async (req, res) => {
    try {
      let filename = req.body.filename || "document.txt";
      let buffer: Buffer | null = null;
      if (req.file) {
        buffer = req.file.buffer;
        filename = req.file.originalname;
      } else if (req.body.contentBase64) {
        buffer = Buffer.from(String(req.body.contentBase64), "base64");
        filename = req.body.filename || "document.bin";
      } else if (!req.body.content) {
        return res.status(400).json({ error: "No file or content provided for parsing." });
      }

      const parsed = buffer
        ? studioEngine.parseUniversalLegalDocument(buffer, filename)
        : studioEngine.parseUniversalLegalDocument(String(req.body.content), filename);
      if (buffer) {
        const vaultBlobId = tryVaultStore(buffer, filename);
        const stored = await recordDossierFile({
          userId: req.user!.id,
          filename,
          bytes: buffer,
          vaultBlobId,
        });
        parsed.metadata = {
          ...parsed.metadata,
          checksum: stored.checksum,
          fileId: stored.fileId,
          version: stored.version,
          vaultBlobId,
        };
      }
      res.json({ success: true, document: parsed });
    } catch (err: any) {
      console.error("[Studio] Universal parse error:", err);
      res.status(500).json({ error: err.message || "Legal document parsing failed" });
    }
  });

  // 4. Agentic Deadlines & Calculation Engine across Global Jurisdictions
  // 4. Agentic Deadlines & Calculation Engine across Global Jurisdictions
  app.post("/api/studio/agentic-deadlines", authenticate, async (req, res) => {
    try {
      const computed = computeStatutoryDeadlines({
        jurisdiction: req.body.jurisdiction,
        procedureFamily: req.body.procedureFamily,
        serviceDate: req.body.serviceDate,
        triggerEvent: req.body.triggerEvent,
      });
      res.json(computed);
    } catch (err: any) {
      console.error("[Studio] Agentic deadlines error:", err);
      res.status(500).json({ error: err.message || "Failed to compute deadlines" });
    }
  });

  app.post("/api/studio/stitch", authenticate, async (req, res) => {
    try {
      const { title, parts, outputFormat, storeInVault } = req.body;
      if (!title || !parts || !Array.isArray(parts)) {
        return res.status(400).json({ error: "Title and document parts are required." });
      }

      const normalizedParts = parts.map((part: any) => ({
        ...part,
        content: part.contentBase64 ? Buffer.from(String(part.contentBase64), "base64") : part.content,
      }));
      const result = await studioEngine.stitchDocuments({
        title,
        parts: normalizedParts,
        outputFormat: outputFormat || "udf",
        storeInVault: storeInVault !== false,
      });
      const vaultBlobId = result.blobId || tryVaultStore(result.buffer, title);
      const stored = await recordDossierFile({
        userId: req.user!.id,
        filename: `${title}.${result.format === "udf" ? "udf" : "txt"}`,
        bytes: result.buffer,
        vaultBlobId,
      });

      res.json({
        id: result.id,
        title: result.title,
        format: result.format,
        sizeBytes: result.sizeBytes,
        blobId: vaultBlobId,
        fileId: stored.fileId,
        checksum: stored.checksum,
        version: stored.version,
      });
    } catch (err: any) {
      console.error("[Studio] Stitch error:", err);
      res.status(500).json({ error: err.message || "Document stitching failed" });
    }
  });

  app.post("/api/studio/workflow/run", authenticate, async (req, res) => {
    try {
      const result = await runWorkflow(req.user!.id, req.body.graph || { nodes: [], edges: [] }, Boolean(req.body.allowWrite));
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Akış çalıştırılamadı." });
    }
  });

  app.post("/api/studio/workflow/stop", authenticate, async (req, res) => {
    stopRun(String(req.body.runId || ""));
    res.json({ stopped: true });
  });

  app.get("/api/studio/approvals", authenticate, async (req, res) => {
    res.json(await listApprovals(req.user!.id));
  });

  app.post("/api/studio/approvals", authenticate, async (req, res) => {
    try {
      const result = await runWorkflow(req.user!.id, {
        nodes: [{
          id: "approval-request",
          type: "approval",
          title: req.body.title || "Onay",
          data: {
            effect: req.body.effect || "write",
            recipient: req.body.recipient,
            content: req.body.content,
            attachment: req.body.attachment,
            diff: req.body.diff,
            config_json: req.body.content,
          },
        }],
        edges: [],
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Onay oluşturulamadı." });
    }
  });

  app.post("/api/studio/approvals/:id", authenticate, async (req, res) => {
    const decision = req.body.decision === "rejected" ? "rejected" : "approved";
    const result = await decideApproval(req.user!.id, req.params.id, decision);
    if (!result) return res.status(404).json({ error: "Onay bulunamadı." });
    res.json(result);
  });

  app.post("/api/studio/precedent", authenticate, async (req, res) => {
    try {
      const query = maskPii(String(req.body.query || "").trim());
      if (!query) return res.status(400).json({ error: "Arama metni gerekli." });
      const court = req.body.court === "uyap-emsal" || req.body.court === "aym" ? req.body.court : "danistay";
      const hits = await searchPrecedents(query, court);
      res.json({ hits });
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Emsal araması tamamlanamadı." });
    }
  });

  app.post("/api/studio/citation-check", authenticate, async (req, res) => {
    const text = String(req.body.text || "");
    const override = req.body.override === true;
    const result = checkCitations(text);
    res.json({ ...result, exportAllowed: result.exportAllowed || override });
  });

  app.post("/api/studio/defense-draft", authenticate, async (req, res) => {
    const draft = buildDefenseDraft({
      matterTitle: String(req.body.matterTitle || ""),
      parties: Array.isArray(req.body.parties) ? req.body.parties.map(String) : [],
      dossierNotes: Array.isArray(req.body.dossierNotes) ? req.body.dossierNotes.map(String) : [],
      precedents: Array.isArray(req.body.precedents) ? req.body.precedents : [],
    });
    res.json(draft);
  });

  app.post("/api/studio/presentation-brief", authenticate, async (req, res) => {
    const brief = presentationBrief(req.body.graph || {}, req.body.matterId);
    const job = await storage.createAIJob({
      userId: req.user!.id,
      status: "completed",
      progress: 100,
      inputText: maskPii(JSON.stringify(brief)),
      output: brief,
    });
    res.json({ brief, jobId: job.id });
  });

  app.post("/api/studio/mail/account", authenticate, async (req, res) => {
    const connectorId = req.body.connectorId === "outlook" ? "outlook" : "gmail";
    const token = String(req.body.accessToken || "");
    if (!token) return res.status(400).json({ error: "Erişim anahtarı gerekli." });
    res.json(await saveConnectorToken(req.user!.id, connectorId, token));
  });

  app.post("/api/studio/mail/inbox", authenticate, async (req, res) => {
    const connectorId = req.body.connectorId === "outlook" ? "outlook" : "gmail";
    try {
      res.json(await readMailbox(req.user!.id, connectorId));
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Posta okunamadı." });
    }
  });

  app.get("/api/studio/matters/:id/tree", authenticate, async (req, res) => {
    res.json(await matterTree(req.user!.id, req.params.id));
  });

  app.post("/api/studio/matters/:id/folders", authenticate, async (req, res) => {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Klasör adı gerekli." });
    res.json(await addMatterFolder(req.user!.id, req.params.id, name, req.body.parentId));
  });

  app.post("/api/studio/matters/:id/files", authenticate, upload.single("file"), async (req, res) => {
    let filename = req.body.filename || "belge";
    let buffer: Buffer | null = null;
    if (req.file) {
      buffer = req.file.buffer;
      filename = req.file.originalname;
    } else if (req.body.contentBase64) {
      buffer = Buffer.from(String(req.body.contentBase64), "base64");
      filename = req.body.filename || "belge.bin";
    }
    let preview = String(req.body.preview || req.body.content || "");
    let checksum = "";
    let vaultBlobId: string | null = null;
    if (buffer) {
      const parsed = studioEngine.parseUniversalLegalDocument(buffer, filename);
      preview = String(parsed.bodyText || parsed.summary || preview);
      vaultBlobId = tryVaultStore(buffer, filename);
      const stored = await recordDossierFile({
        userId: req.user!.id,
        filename,
        bytes: buffer,
        vaultBlobId,
      });
      checksum = stored.checksum;
    }
    const folders = await matterTree(req.user!.id, req.params.id);
    const preferred = (folders.folders as { id: string; name: string }[]).find((folder) => folder.name === "Evraklar");
    const saved = await addMatterFile({
      userId: req.user!.id,
      matterId: req.params.id,
      folderId: req.body.folderId || preferred?.id,
      title: filename,
      mime: req.file?.mimetype || "",
      preview,
      sha256: checksum,
      vaultBlobId,
      source: buffer ? "ingest" : "note",
    });
    res.json(saved);
  });

  app.patch("/api/studio/matters/:id/files/:fileId", authenticate, async (req, res) => {
    res.json(await moveMatterFile(req.user!.id, req.params.fileId, req.body.folderId ?? null, req.body.title));
  });

  app.post("/api/studio/matters/:id/notes", authenticate, async (req, res) => {
    const body = String(req.body.body || "").trim();
    if (!body) return res.status(400).json({ error: "Not boş olamaz." });
    res.json(await addMatterNote(req.user!.id, req.params.id, body));
  });

  // ========== ZENIUM AGENTIC BROWSER ROUTES ==========

  app.post("/api/zenium/research", authenticate, async (req, res) => {
    try {
      const { query, target } = req.body;
      if (!query) {
        return res.status(400).json({ error: "Query is required for Zenium agent." });
      }

      const task = await zeniumEngine.executeAgenticResearch(query, target);
      res.json(task);
    } catch (err: any) {
      console.error("[Zenium] Research error:", err);
      res.status(500).json({ error: err.message || "Agentic research failed" });
    }
  });

  app.get("/api/zenium/tasks", authenticate, async (_req, res) => {
    try {
      res.json(zeniumEngine.listTasks());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/vault/blobs/:blobId", authenticate, async (req, res) => {
    try {
      const { blobId } = req.params;
      const decrypted = zenVault.retrieveAndDecrypt(blobId, req.user!.id);
      res.setHeader("Content-Disposition", `inline; filename="blob-${blobId.slice(0, 8)}"`);
      res.send(decrypted);
    } catch (err: any) {
      const status = err.message.includes("Access denied") ? 403 : 404;
      res.status(status).json({ error: err.message || "Failed to retrieve encrypted vault blob" });
    }
  });

  app.delete("/api/vault/blobs/:blobId", authenticate, async (req, res) => {
    try {
      const { blobId } = req.params;
      zenVault.removeBlob(blobId, req.user!.id);
      res.json({ success: true });
    } catch (err: any) {
      const status = err.message.includes("Access denied") ? 403 : 400;
      res.status(status).json({ error: err.message || "Failed to remove vault blob" });
    }
  });


  // ========== CHAT INVITE ROUTES ==========

  // Generate invite code
  const generateInviteCode = (): string => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const part1 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    const part2 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    return `ZEN-${part1}-${part2}`;
  };

  // Create a new chat invite
  app.post("/api/chat-invites", authenticate, async (req, res) => {
    try {
      let code = generateInviteCode();
      let existing = await storage.getChatInvite(code);
      while (existing) {
        code = generateInviteCode();
        existing = await storage.getChatInvite(code);
      }

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      const invite = await storage.createChatInvite({
        code,
        creatorId: req.user!.id,
        creatorPublicKey: req.body.publicKey || null,
        status: "pending",
        expiresAt,
      });
      res.status(201).json(invite);
    } catch (error) {
      res.status(500).json({ error: "Davet kodu oluşturulamadı." });
    }
  });

  // Get user's chat invites
  app.get("/api/chat-invites", authenticate, async (req, res) => {
    try {
      const invites = await storage.getUserChatInvites(req.user!.id);
      res.json(invites);
    } catch (error) {
      res.status(500).json({ error: "Davet kodları yüklenemedi." });
    }
  });

  // Join a chat via invite code
  app.post("/api/chat-invites/join", authenticate, async (req, res) => {
    try {
      const { code, publicKey } = req.body;
      if (!code) {
        return res.status(400).json({ error: "Davet kodu gerekli." });
      }

      const normalizedCode = code.trim().toUpperCase();
      console.log(`[chat-invite] Join attempt: code="${normalizedCode}" by user ${req.user!.id}`);
      
      const invite = await storage.getChatInvite(normalizedCode);
      console.log(`[chat-invite] Invite lookup result:`, invite ? `found (id=${invite.id}, status=${invite.status})` : "not found");
      if (!invite) {
        return res.status(404).json({ error: "Davet kodu bulunamadı." });
      }

      if (invite.status !== "pending") {
        return res.status(400).json({ error: "Bu davet kodu artık geçerli değil." });
      }

      if (new Date() > invite.expiresAt) {
        await storage.updateChatInvite(invite.id, { status: "expired" });
        return res.status(400).json({ error: "Davet kodunun süresi dolmuş." });
      }

      if (invite.creatorId === req.user!.id) {
        return res.status(400).json({ error: "Kendi davet kodunuza katılamazsınız." });
      }

      // Create conversation
      const conversation = await storage.createConversation({
        participants: [String(invite.creatorId), String(req.user!.id)],
        isEncrypted: true,
      });

      // Create contact for both users
      const creator = await storage.getUser(invite.creatorId);
      const joiner = await storage.getUser(req.user!.id);

      if (creator && joiner) {
        // Add contact for creator (pointing to joiner)
        await storage.createContact({
          userId: invite.creatorId,
          targetUserId: joiner.id,
          encryptedData: JSON.stringify({ name: joiner.displayName || joiner.username || `Kullanıcı ${joiner.id}` }),
          nameBlindIndex: `user_${joiner.id}`,
          status: "online",
          publicKey: publicKey || undefined,
        });

        // Add contact for joiner (pointing to creator)
        await storage.createContact({
          userId: req.user!.id,
          targetUserId: creator.id,
          encryptedData: JSON.stringify({ name: creator.displayName || creator.username || `Kullanıcı ${creator.id}` }),
          nameBlindIndex: `user_${creator.id}`,
          status: "online",
          publicKey: invite.creatorPublicKey || undefined,
        });
      }

      // Update invite status
      await storage.updateChatInvite(invite.id, {
        status: "accepted",
        conversationId: conversation.id,
        joinerPublicKey: publicKey || null,
      });

      res.json({
        success: true,
        conversation,
        creatorPublicKey: invite.creatorPublicKey,
      });
    } catch (error) {
      console.error("Join invite error:", error);
      res.status(500).json({ error: "Sohbete katılınamadı." });
    }
  });

  // ========== ACCOUNTING ROUTES ==========

  app.get("/api/accounting", authenticate, async (req, res) => {
    try {
      const entries = await storage.getAccountingEntries(req.user!.id);
      res.json(entries);
    } catch (error) {
      res.status(500).json({ error: "Muhasebe kayıtları yüklenemedi." });
    }
  });

  app.get("/api/accounting/:id", authenticate, async (req, res) => {
    try {
      const entry = await storage.getAccountingEntry(parseInt(req.params.id));
      if (!entry || entry.userId !== req.user!.id) {
        return res.status(404).json({ error: "Kayıt bulunamadı." });
      }
      res.json(entry);
    } catch (error) {
      res.status(500).json({ error: "Kayıt yüklenemedi." });
    }
  });

  app.post("/api/accounting", authenticate, async (req, res) => {
    try {
      const parsed = insertAccountingEntrySchema.parse({ ...req.body, userId: req.user!.id });
      const entry = await storage.createAccountingEntry(parsed);
      
      // Create notification for accounting entry
      const categoryLabel = parsed.category === 'income' ? 'Gelir' : parsed.category === 'expense' ? 'Gider' : parsed.category === 'asset' ? 'Varlık' : 'Borç';
      const rawBody = req.body as { amount?: number | string; description?: string };
      const amountStr = rawBody.amount !== undefined ? `${rawBody.amount} TL` : 'Muhasebe kaydı';
      const descStr = rawBody.description || '';
      await storage.createNotification({
        userId: req.user!.id,
        type: 'accounting_entry',
        title: `Muhasebe - ${categoryLabel}`,
        message: `${amountStr}${descStr ? ' - ' + descStr : ''}`,
        icon: 'calculator',
        isRead: false,
        metadata: { entryId: entry.id, amount: rawBody.amount, category: parsed.category },
      });
      
      res.status(201).json(entry);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Kayıt oluşturulamadı." });
    }
  });

  app.patch("/api/accounting/:id", authenticate, async (req, res) => {
    try {
      const entry = await storage.getAccountingEntry(parseInt(req.params.id));
      if (!entry || entry.userId !== req.user!.id) {
        return res.status(404).json({ error: "Kayıt bulunamadı." });
      }
      const updated = await storage.updateAccountingEntry(parseInt(req.params.id), req.body);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Kayıt güncellenemedi." });
    }
  });

  app.delete("/api/accounting/:id", authenticate, async (req, res) => {
    try {
      const entry = await storage.getAccountingEntry(parseInt(req.params.id));
      if (!entry || entry.userId !== req.user!.id) {
        return res.status(404).json({ error: "Kayıt bulunamadı." });
      }
      await storage.deleteAccountingEntry(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Kayıt silinemedi." });
    }
  });

  // ========== CALL SESSION ROUTES ==========

  app.get("/api/calls", authenticate, async (req, res) => {
    try {
      const calls = await storage.getCallSessions(req.user!.id.toString());
      res.json(calls);
    } catch (error) {
      res.status(500).json({ error: "Aramalar yüklenemedi." });
    }
  });

  app.post("/api/calls", authenticate, async (req, res) => {
    try {
      const parsed = insertCallSessionSchema.parse(req.body);
      const call = await storage.createCallSession(parsed);
      res.status(201).json(call);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Arama başlatılamadı." });
    }
  });

  app.patch("/api/calls/:id", authenticate, async (req, res) => {
    try {
      const updated = await storage.updateCallSession(parseInt(req.params.id), req.body);
      if (!updated) {
        return res.status(404).json({ error: "Arama bulunamadı." });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Arama güncellenemedi." });
    }
  });

  // ========== PRESENTATION ROUTES ==========

  app.get("/api/presentations", authenticate, async (req, res) => {
    try {
      const presentations = await storage.getPresentations(req.user!.id);
      res.json(presentations);
    } catch (error) {
      res.status(500).json({ error: "Sunumlar yüklenemedi." });
    }
  });

  app.get("/api/presentations/:id", authenticate, async (req, res) => {
    try {
      const presentation = await storage.getPresentation(parseInt(req.params.id));
      if (!presentation || presentation.userId !== req.user!.id) {
        return res.status(404).json({ error: "Sunum bulunamadı." });
      }
      res.json(presentation);
    } catch (error) {
      res.status(500).json({ error: "Sunum yüklenemedi." });
    }
  });

  app.post("/api/presentations", authenticate, async (req, res) => {
    try {
      const parsed = insertPresentationSchema.parse({ ...req.body, userId: req.user!.id });
      const presentation = await storage.createPresentation(parsed);
      res.status(201).json(presentation);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Sunum oluşturulamadı." });
    }
  });

  app.patch("/api/presentations/:id", authenticate, async (req, res) => {
    try {
      const presentation = await storage.getPresentation(parseInt(req.params.id));
      if (!presentation || presentation.userId !== req.user!.id) {
        return res.status(404).json({ error: "Sunum bulunamadı." });
      }
      const updated = await storage.updatePresentation(parseInt(req.params.id), req.body);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Sunum güncellenemedi." });
    }
  });

  app.delete("/api/presentations/:id", authenticate, async (req, res) => {
    try {
      const presentation = await storage.getPresentation(parseInt(req.params.id));
      if (!presentation || presentation.userId !== req.user!.id) {
        return res.status(404).json({ error: "Sunum bulunamadı." });
      }
      await storage.deletePresentation(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Sunum silinemedi." });
    }
  });

  // ========== SLIDE ROUTES ==========

  app.get("/api/presentations/:id/slides", authenticate, async (req, res) => {
    try {
      const presentation = await storage.getPresentation(parseInt(req.params.id));
      if (!presentation || presentation.userId !== req.user!.id) {
        return res.status(404).json({ error: "Sunum bulunamadı." });
      }
      const slides = await storage.getSlides(parseInt(req.params.id));
      res.json(slides);
    } catch (error) {
      res.status(500).json({ error: "Slaytlar yüklenemedi." });
    }
  });

  app.post("/api/slides", authenticate, async (req, res) => {
    try {
      const parsed = insertSlideSchema.parse(req.body);
      const presentation = await storage.getPresentation(parsed.presentationId);
      if (!presentation || presentation.userId !== req.user!.id) {
        return res.status(404).json({ error: "Sunum bulunamadı." });
      }
      const slide = await storage.createSlide(parsed);
      res.status(201).json(slide);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Slayt oluşturulamadı." });
    }
  });

  app.patch("/api/slides/:id", authenticate, async (req, res) => {
    try {
      const updated = await storage.updateSlide(parseInt(req.params.id), req.body);
      if (!updated) {
        return res.status(404).json({ error: "Slayt bulunamadı." });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Slayt güncellenemedi." });
    }
  });

  app.delete("/api/slides/:id", authenticate, async (req, res) => {
    try {
      await storage.deleteSlide(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Slayt silinemedi." });
    }
  });

  // ========== SLIDE ELEMENT ROUTES ==========

  app.get("/api/slides/:id/elements", authenticate, async (req, res) => {
    try {
      const elements = await storage.getSlideElements(parseInt(req.params.id));
      res.json(elements);
    } catch (error) {
      res.status(500).json({ error: "Elemanlar yüklenemedi." });
    }
  });

  app.post("/api/slide-elements", authenticate, async (req, res) => {
    try {
      const parsed = insertSlideElementSchema.parse(req.body);
      const element = await storage.createSlideElement(parsed);
      res.status(201).json(element);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Eleman oluşturulamadı." });
    }
  });

  app.patch("/api/slide-elements/:id", authenticate, async (req, res) => {
    try {
      const updated = await storage.updateSlideElement(parseInt(req.params.id), req.body);
      if (!updated) {
        return res.status(404).json({ error: "Eleman bulunamadı." });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Eleman güncellenemedi." });
    }
  });

  app.delete("/api/slide-elements/:id", authenticate, async (req, res) => {
    try {
      await storage.deleteSlideElement(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Eleman silinemedi." });
    }
  });

  // ========== AI JOB ROUTES ==========

  app.get("/api/ai-jobs", authenticate, async (req, res) => {
    try {
      const jobs = await storage.getAIJobs(req.user!.id);
      res.json(jobs);
    } catch (error) {
      res.status(500).json({ error: "AI işleri yüklenemedi." });
    }
  });

  app.get("/api/ai-jobs/:id", authenticate, async (req, res) => {
    try {
      const job = await storage.getAIJob(parseInt(req.params.id));
      if (!job || job.userId !== req.user!.id) {
        return res.status(404).json({ error: "AI iş bulunamadı." });
      }
      res.json(job);
    } catch (error) {
      res.status(500).json({ error: "AI iş yüklenemedi." });
    }
  });

  app.post("/api/ai-jobs", authenticate, async (req, res) => {
    try {
      const parsed = insertAIJobSchema.parse({ ...req.body, userId: req.user!.id });
      const job = await storage.createAIJob(parsed);
      res.status(201).json(job);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "AI iş oluşturulamadı." });
    }
  });

  // ========== ZENLECS+ AI CHAT & MODELS ==========

  app.get("/api/ai/models", authenticate, async (_req, res) => {
    try {
      const models = await zenlecsAI.getAvailableModels();
      res.json(models);
    } catch (error) {
      res.status(500).json({ error: "Modeller yüklenemedi." });
    }
  });

  app.get("/api/ai/conversations", authenticate, async (req, res) => {
    try {
      await zenlecsAI.ensureTablesExist();
      const convs = await storage.getAIConversations(req.user!.id);
      res.json(convs);
    } catch (error) {
      res.status(500).json({ error: "Sohbetler yüklenemedi." });
    }
  });

  app.post("/api/ai/conversations", authenticate, async (req, res) => {
    try {
      await zenlecsAI.ensureTablesExist();
      const parsed = insertAIConversationSchema.parse({
        title: req.body.title || "Yeni Sohbet",
        model: req.body.model || "zenlecs-core",
        userId: req.user!.id,
      });
      const conv = await storage.createAIConversation(parsed);
      res.status(201).json(conv);
    } catch (error) {
      res.status(500).json({ error: "Sohbet oluşturulamadı." });
    }
  });

  app.get("/api/ai/conversations/:id/messages", authenticate, async (req, res) => {
    try {
      await zenlecsAI.ensureTablesExist();
      const convId = parseInt(req.params.id);
      const conv = await storage.getAIConversation(convId);
      if (!conv || conv.userId !== req.user!.id) {
        return res.status(404).json({ error: "Sohbet bulunamadı." });
      }
      const msgs = await storage.getAIChatMessages(convId);
      res.json(msgs);
    } catch (error) {
      res.status(500).json({ error: "Mesajlar yüklenemedi." });
    }
  });

  app.delete("/api/ai/conversations/:id", authenticate, async (req, res) => {
    try {
      await zenlecsAI.ensureTablesExist();
      const convId = parseInt(req.params.id);
      const conv = await storage.getAIConversation(convId);
      if (!conv || conv.userId !== req.user!.id) {
        return res.status(404).json({ error: "Sohbet bulunamadı." });
      }
      await storage.deleteAIChatMessages(convId);
      await storage.deleteAIConversation(convId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Sohbet silinemedi." });
    }
  });

  // Stream endpoint for real-time text generation (SSE)
  app.post("/api/ai/chat/stream", authenticate, async (req, res) => {
    // Sohbet turu durum takibi (hata durumunda geri alma için)
    let convId: number | null = null;
    let createdConversationId: number | null = null;
    let contentEmitted = false;
    let headersFlushed = false;

    const writeEvent = (payload: Record<string, unknown>) => {
      if (res.writableEnded || res.destroyed) return;
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    // İstemci bağlantıyı kapatırsa üretimi durdur (boşa token harcamayalım).
    const generationAbort = new AbortController();
    const handleClientClose = () => {
      if (!res.writableEnded) generationAbort.abort();
    };
    res.on("close", handleClientClose);

    try {
      await zenlecsAI.ensureTablesExist();
      const { conversationId, content, model } = req.body ?? {};

      const trimmedContent = typeof content === "string" ? content.trim() : "";
      if (!trimmedContent) {
        return res.status(400).json({ error: "Mesaj içeriği gerekli." });
      }

      const requestedConvId =
        conversationId === null || conversationId === undefined ? null : Number(conversationId);
      if (requestedConvId !== null && (!Number.isInteger(requestedConvId) || requestedConvId <= 0)) {
        return res.status(400).json({ error: "Geçersiz sohbet kimliği." });
      }

      const selectedModel = resolveAIModel(typeof model === "string" ? model : undefined);

      if (requestedConvId) {
        const conv = await storage.getAIConversation(requestedConvId);
        if (!conv || conv.userId !== req.user!.id) {
          return res.status(404).json({ error: "Sohbet bulunamadı." });
        }
        convId = conv.id;
      } else {
        const summaryTitle = trimmedContent.slice(0, 35) + (trimmedContent.length > 35 ? "..." : "");
        const newConv = await storage.createAIConversation({
          userId: req.user!.id,
          title: summaryTitle,
          model: selectedModel,
        });
        convId = newConv.id;
        createdConversationId = newConv.id;
      }

      // 1. Save user message
      await storage.createAIChatMessage({
        conversationId: convId,
        role: "user",
        content: trimmedContent,
      });

      // 2. Load conversation history
      const prevMessages = await storage.getAIChatMessages(convId);
      const history = prevMessages.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      }));

      // 3. Groq dönüşümü: her iki promptta bir sıradaki modelle devam et
      const promptCount = history.filter((m) => m.role === "user").length;
      const rotationModel = resolveRotationModel(promptCount);

      // Setup Server-Sent Events (SSE)
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();
      headersFlushed = true;

      writeEvent({ type: "meta", conversationId: convId, model: rotationModel });

      const fullResponse = await zenlecsAI.streamChatResponse(
        rotationModel,
        history,
        (chunk) => {
          contentEmitted = true;
          writeEvent({ type: "chunk", chunk });
        },
        { signal: generationAbort.signal }
      );

      if (!fullResponse || !fullResponse.trim()) {
        throw new Error("Yapay zeka boş yanıt döndürdü.");
      }

      const assistantMsg = await storage.createAIChatMessage({
        conversationId: convId,
        role: "assistant",
        content: fullResponse,
      });

      writeEvent({ type: "done", message: assistantMsg });
      if (!res.writableEnded) res.end();
    } catch (error) {
      const clientDisconnected = generationAbort.signal.aborted || res.destroyed;

      if (clientDisconnected) {
        // İstemci vazgeçti: kayıt yazma, yarım turu geri de alma.
        log("AI Chat Stream: istemci bağlantıyı kapattı, üretim durduruldu", "routes");
        if (!res.writableEnded) res.end();
        return;
      }

      console.error("AI Chat Stream error:", error);
      const message = describeAIError(error);

      // İçerik üretilemeden başarısız olan turu geri al: yarım kalmış,
      // yanıtsız bir sohbet kaydı bırakma.
      if (!contentEmitted && createdConversationId) {
        try {
          await storage.deleteAIChatMessages(createdConversationId);
          await storage.deleteAIConversation(createdConversationId);
        } catch (cleanupError) {
          console.error("AI Chat Stream rollback error:", cleanupError);
        }
      }

      if (!headersFlushed) {
        return res.status(500).json({ error: message });
      }

      writeEvent({ type: "error", error: message });
      if (!res.writableEnded) res.end();
    }
  });

  // ========== DASHBOARD STATS ==========

  app.get("/api/dashboard/stats", authenticate, async (req, res) => {
    try {
      const [casesData, walletsData, accountingData] = await Promise.all([
        storage.getCases(req.user!.id),
        storage.getWallets(req.user!.id),
        storage.getAccountingEntries(req.user!.id),
      ]);

      const activeCases = casesData.filter((c) => c.status === "active").length;
      const pendingCases = casesData.filter((c) => c.status === "pending").length;

      // In ZKA, the server cannot calculate balance or income because amounts are encrypted.
      // These will be calculated on the client side instead.
      const totalBalance = 0;
      const monthlyIncome = 0;

      res.json({
        activeCases,
        pendingCases,
        totalCases: casesData.length,
        totalBalance,
        monthlyIncome,
        walletCount: walletsData.length,
      });
    } catch (error) {
      res.status(500).json({ error: "İstatistikler yüklenemedi." });
    }
  });

  // ========== NOTIFICATIONS ==========

  app.get("/api/notifications", authenticate, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const notifications = await storage.getNotifications(req.user!.id, limit);
      const unreadCount = await storage.getUnreadNotificationCount(req.user!.id);
      res.json({ notifications, unreadCount });
    } catch (error) {
      res.status(500).json({ error: "Bildirimler yüklenemedi." });
    }
  });

  app.post("/api/notifications", authenticate, async (req, res) => {
    try {
      const { type, title, message, icon, metadata } = req.body;
      const notification = await NotificationEngine.dispatch(req.user!.id, {
        type, title, message, icon, metadata
      });
      res.status(201).json(notification);
    } catch (error) {
      log(`Failed to create notification: ${error}`, "routes");
      res.status(500).json({ error: "Bildirim oluşturulamadı." });
    }
  });

  app.patch("/api/notifications/:id/read", authenticate, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const notification = await storage.markNotificationAsRead(id);
      if (!notification) {
        return res.status(404).json({ error: "Bildirim bulunamadı." });
      }
      res.json(notification);
    } catch (error) {
      res.status(500).json({ error: "Bildirim güncellenemedi." });
    }
  });

  app.patch("/api/notifications/read-all", authenticate, async (req, res) => {
    try {
      await storage.markAllNotificationsAsRead(req.user!.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Bildirimler güncellenemedi." });
    }
  });

  app.delete("/api/notifications/:id", authenticate, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteNotification(id);
      if (!deleted) {
        return res.status(404).json({ error: "Bildirim bulunamadı." });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Bildirim silinemedi." });
    }
  });

  // ========== LINK PREVIEW ==========
  app.get("/api/link-preview", authenticate, async (req, res) => {
    try {
      const targetUrl = req.query.url as string;
      if (!targetUrl || (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://'))) {
        return res.status(400).json({ error: "Geçersiz URL." });
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'ZenOSBot/1.0 (+https://zenos.com)'
        }
      });
      
      clearTimeout(timeoutId);

      const html = await response.text();
      
      const titleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"[^>]*>|<title>([^<]*)<\/title>/i);
      const descMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"[^>]*>|<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i);
      const imgMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"[^>]*>/i);

      let title = titleMatch ? (titleMatch[1] || titleMatch[2]) : "";
      let description = descMatch ? (descMatch[1] || descMatch[2]) : "";
      let image = imgMatch ? imgMatch[1] : "";

      res.json({
        title: title || targetUrl,
        description,
        image,
        url: targetUrl
      });
    } catch (error) {
      res.json({ title: req.query.url as string, description: "", image: "", url: req.query.url as string });
      res.json({ title: req.query.url as string, description: "", image: "", url: req.query.url as string });
    }
  });

  // Zenium Native Search Endpoint (DuckDuckGo HTML Proxy)
  app.get("/api/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      const page = parseInt(req.query.page as string) || 1;
      
      if (!query) {
        return res.status(400).json({ error: "Query is required" });
      }

      let html = '';
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      };

      if (page === 1) {
        const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { headers });
        html = await response.text();
      } else {
        // Fetch page 1 to get the vqd token
        const res1 = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { headers });
        const html1 = await res1.text();
        const $1 = cheerio.load(html1);
        const vqd = $1('input[name="vqd"]').val();
        
        if (!vqd) {
          return res.json({ results: [] });
        }

        // Calculate offset (DDG uses around 30 per page initially, but let's use standard s values)
        // Usually: s=30 for page 2, s=60 for page 3
        let sStr = "30";
        if (page === 2) sStr = "30";
        else if (page === 3) sStr = "60";
        else if (page === 4) sStr = "90";
        else if (page === 5) sStr = "120";
        
        const body = new URLSearchParams({
          q: query,
          s: sStr,
          nextParams: '',
          v: 'l',
          o: 'json',
          dc: sStr,
          api: 'd.js',
          vqd: vqd as string,
          kl: 'us-en'
        });

        const res2 = await fetch('https://html.duckduckgo.com/html/', {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: body.toString()
        });
        html = await res2.text();
      }
      
      const $ = cheerio.load(html);
      const results: { title: string, url: string, snippet: string }[] = [];

      $('.result').each((_, el) => {
        const titleEl = $(el).find('.result__title .result__a');
        const snippetEl = $(el).find('.result__snippet');
        const urlEl = $(el).find('.result__url');
        
        if (titleEl.length && urlEl.length) {
          let url = titleEl.attr('href') || '';
          if (url.startsWith('//duckduckgo.com/l/?uddg=')) {
            const encodedUrl = url.split('uddg=')[1].split('&')[0];
            url = decodeURIComponent(encodedUrl);
          }
          
          results.push({
            title: titleEl.text().trim(),
            url: url.trim(),
            snippet: snippetEl.text().trim()
          });
        }
      });

      res.json({ results });
    } catch (error) {
      console.error("Search API Error:", error);
      res.status(500).json({ error: "Search failed" });
    }
  });

  // Setup WebSocket server for real-time messaging and P2P signaling
  setupWebSocket(httpServer);

  return httpServer;
}
