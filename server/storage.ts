import {
  users, sessions, userProfiles, userSettings,
  wallets, walletKeys, transactions,
  cases, documents, contacts, conversations, messages,
  accountingEntries, callSessions, presentations, slides, slideElements, aiJobs, rateLimits, chatInvites, notifications, studioGraphStates,
  aiConversations, aiChatMessages,
  type User, type InsertUser,
  type Session, type InsertSession,
  type UserProfile, type InsertUserProfile,
  type UserSettings, type InsertUserSettings,
  type Wallet, type InsertWallet,
  type WalletKey, type InsertWalletKey,
  type Transaction, type InsertTransaction,
  type Case, type InsertCase,
  type Document, type InsertDocument,
  type Contact, type InsertContact,
  type Conversation, type InsertConversation,
  type Message, type InsertMessage,
  type AccountingEntry, type InsertAccountingEntry,
  type CallSession, type InsertCallSession,
  type Presentation, type InsertPresentation,
  type Slide, type InsertSlide,
  type SlideElement, type InsertSlideElement,
  type AIJob, type InsertAIJob,
  type RateLimit, type InsertRateLimit,
  type ChatInvite, type InsertChatInvite,
  type Notification, type InsertNotification,
  type StudioGraphState, type InsertStudioGraphState,
  type AIConversation, type InsertAIConversation,
  type AIChatMessage, type InsertAIChatMessage,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, sql, arrayContains, gte, lte, ilike, ne, or } from "drizzle-orm";
import { encrypt, decrypt } from "./crypto";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<User>): Promise<User | undefined>;
  setAlias(userId: number, username: string): Promise<User | undefined>;
  searchUsersByAlias(query: string, currentUserId: number): Promise<{ id: number, username: string | null, displayName: string | null, avatar: string | null, publicKey: string | null }[]>;

  // Sessions
  getSession(id: number): Promise<Session | undefined>;
  getSessionByToken(tokenHash: string): Promise<Session | undefined>;
  createSession(session: InsertSession): Promise<Session>;
  updateSession(id: number, updates: Partial<Session>): Promise<Session | undefined>;
  deleteSession(id: number): Promise<boolean>;
  deleteUserSessions(userId: number): Promise<boolean>;

  // User Profiles
  getUserProfile(userId: number): Promise<UserProfile | undefined>;
  createUserProfile(profile: InsertUserProfile): Promise<UserProfile>;
  updateUserProfile(userId: number, updates: Partial<UserProfile>): Promise<UserProfile | undefined>;

  // User Settings
  getUserSettings(userId: number): Promise<UserSettings | undefined>;
  createUserSettings(settings: InsertUserSettings): Promise<UserSettings>;
  updateUserSettings(userId: number, updates: Partial<UserSettings>): Promise<UserSettings | undefined>;

  // Wallets
  getWallets(userId: number): Promise<Wallet[]>;
  getWallet(id: number): Promise<Wallet | undefined>;
  createWallet(wallet: InsertWallet): Promise<Wallet>;
  updateWallet(id: number, updates: Partial<Wallet>): Promise<Wallet | undefined>;
  deleteWallet(id: number): Promise<boolean>;

  // Wallet Keys
  getWalletKey(walletId: number): Promise<WalletKey | undefined>;
  createWalletKey(key: InsertWalletKey): Promise<WalletKey>;
  updateWalletKey(walletId: number, updates: Partial<WalletKey>): Promise<WalletKey | undefined>;

  // Transactions
  getTransactions(walletId: number): Promise<Transaction[]>;
  getTransaction(id: number): Promise<Transaction | undefined>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  updateTransaction(id: number, updates: Partial<Transaction>): Promise<Transaction | undefined>;

  // Cases
  getCases(userId: number): Promise<Case[]>;
  getCase(id: number): Promise<Case | undefined>;
  createCase(caseData: InsertCase): Promise<Case>;
  updateCase(id: number, updates: Partial<Case>): Promise<Case | undefined>;
  deleteCase(id: number): Promise<boolean>;

  // Documents
  getDocuments(userId: number, caseId?: number): Promise<Document[]>;
  getDocument(id: number): Promise<Document | undefined>;
  createDocument(document: InsertDocument): Promise<Document>;
  updateDocument(id: number, updates: Partial<Document>): Promise<Document | undefined>;
  deleteDocument(id: number): Promise<boolean>;

  // Contacts
  getContacts(userId: number): Promise<Contact[]>;
  getContact(id: number): Promise<Contact | undefined>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: number, updates: Partial<Contact>): Promise<Contact | undefined>;
  deleteContact(id: number): Promise<boolean>;

  // Conversations
  getConversations(userId: string): Promise<Conversation[]>;
  getConversation(id: number): Promise<Conversation | undefined>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(id: number, updates: Partial<Conversation>): Promise<Conversation | undefined>;
  createDirectConversation(userId: number, targetUserId: number, targetPublicKey?: string, userPublicKey?: string): Promise<Conversation>;

  // Messages
  getMessages(conversationId: number): Promise<Message[]>;
  getMessage(id: number): Promise<Message | undefined>;
  createMessage(message: InsertMessage): Promise<Message>;
  updateMessage(id: number, updates: Partial<Message>): Promise<Message | undefined>;

  // Accounting Entries
  getAccountingEntries(userId: number): Promise<AccountingEntry[]>;
  getAccountingEntry(id: number): Promise<AccountingEntry | undefined>;
  createAccountingEntry(entry: InsertAccountingEntry): Promise<AccountingEntry>;
  updateAccountingEntry(id: number, updates: Partial<AccountingEntry>): Promise<AccountingEntry | undefined>;
  deleteAccountingEntry(id: number): Promise<boolean>;

  // Call Sessions
  getCallSessions(userId: string): Promise<CallSession[]>;
  getCallSession(id: number): Promise<CallSession | undefined>;
  createCallSession(session: InsertCallSession): Promise<CallSession>;
  updateCallSession(id: number, updates: Partial<CallSession>): Promise<CallSession | undefined>;

  // Presentations
  getPresentations(userId: number): Promise<Presentation[]>;
  getPresentation(id: number): Promise<Presentation | undefined>;
  createPresentation(presentation: InsertPresentation): Promise<Presentation>;
  updatePresentation(id: number, updates: Partial<Presentation>): Promise<Presentation | undefined>;
  deletePresentation(id: number): Promise<boolean>;

  // Slides
  getSlides(presentationId: number): Promise<Slide[]>;
  getSlide(id: number): Promise<Slide | undefined>;
  createSlide(slide: InsertSlide): Promise<Slide>;
  updateSlide(id: number, updates: Partial<Slide>): Promise<Slide | undefined>;
  deleteSlide(id: number): Promise<boolean>;

  // Slide Elements
  getSlideElements(slideId: number): Promise<SlideElement[]>;
  getSlideElement(id: number): Promise<SlideElement | undefined>;
  createSlideElement(element: InsertSlideElement): Promise<SlideElement>;
  updateSlideElement(id: number, updates: Partial<SlideElement>): Promise<SlideElement | undefined>;
  deleteSlideElement(id: number): Promise<boolean>;

  // AI Jobs
  getAIJobs(userId: number): Promise<AIJob[]>;
  getAIJob(id: number): Promise<AIJob | undefined>;
  createAIJob(job: InsertAIJob): Promise<AIJob>;
  updateAIJob(id: number, updates: Partial<AIJob>): Promise<AIJob | undefined>;

  // Rate Limiting
  getRateLimit(key: string): Promise<RateLimit | undefined>;
  createOrUpdateRateLimit(key: string, expiresAt: Date): Promise<RateLimit>;
  cleanExpiredRateLimits(): Promise<void>;

  // Chat Invites
  getChatInvite(code: string): Promise<ChatInvite | undefined>;
  getChatInviteById(id: number): Promise<ChatInvite | undefined>;
  getUserChatInvites(userId: number): Promise<ChatInvite[]>;
  createChatInvite(invite: InsertChatInvite): Promise<ChatInvite>;
  updateChatInvite(id: number, updates: Partial<ChatInvite>): Promise<ChatInvite | undefined>;

  // Notifications
  getNotifications(userId: number, limit?: number): Promise<Notification[]>;
  getUnreadNotificationCount(userId: number): Promise<number>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: number): Promise<Notification | undefined>;
  markAllNotificationsAsRead(userId: number): Promise<void>;
  deleteNotification(id: number): Promise<boolean>;

  // Studio Graph States (NeoGraph)
  getStudioGraphState(userId: number): Promise<StudioGraphState | undefined>;
  saveStudioGraphState(userId: number, graphData: string, title?: string): Promise<StudioGraphState>;

  // AI Chat Conversations & Messages
  getAIConversations(userId: number): Promise<AIConversation[]>;
  getAIConversation(id: number): Promise<AIConversation | undefined>;
  createAIConversation(conv: InsertAIConversation): Promise<AIConversation>;
  updateAIConversation(id: number, updates: Partial<AIConversation>): Promise<AIConversation | undefined>;
  deleteAIConversation(id: number): Promise<boolean>;
  getAIChatMessages(conversationId: number): Promise<AIChatMessage[]>;
  createAIChatMessage(msg: InsertAIChatMessage): Promise<AIChatMessage>;
  deleteAIChatMessages(conversationId: number): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // ========== USERS ==========
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    if (user) return user;
    
    // Fallback for ZKA Vault login: If username is overwritten by an alias, 
    // the vaultId is still inside vaultPayload.
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(username);
    if (isUUID) {
      const [vaultUser] = await db.select().from(users).where(ilike(users.vaultPayload, `%"vaultId":"${username}"%`));
      return vaultUser || undefined;
    }
    
    return undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser as typeof users.$inferInsert).returning();
    return user;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User | undefined> {
    const [user] = await db.update(users).set({ ...updates, updatedAt: new Date() }).where(eq(users.id, id)).returning();
    return user || undefined;
  }

  async setAlias(userId: number, username: string): Promise<User | undefined> {
    const user = await this.getUser(userId);
    if (!user) return undefined;
    
    // If the username is a UUID (vaultId), it means the alias is not set yet.
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.username || "");
    if (user.username && !isUUID) {
      throw new Error("Kullanıcı adı zaten belirlenmiş ve değiştirilemez.");
    }
    
    const existing = await this.getUserByUsername(username);
    if (existing) throw new Error("Bu kullanıcı adı başkası tarafından kullanılıyor.");
    
    return this.updateUser(userId, { username });
  }

  async searchUsersByAlias(query: string, currentUserId: number): Promise<{ id: number, username: string | null, displayName: string | null, avatar: string | null, publicKey: string | null }[]> {
    return db.select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatar: users.avatar,
      publicKey: users.publicKey,
    })
    .from(users)
    .where(
      and(
        or(
          ilike(users.username, `%${query}%`),
          ilike(users.displayName, `%${query}%`)
        ),
        ne(users.id, currentUserId)
      )
    )
    .limit(10);
  }

  // ========== SESSIONS ==========
  async getSession(id: number): Promise<Session | undefined> {
    const [session] = await db.select().from(sessions).where(eq(sessions.id, id));
    return session || undefined;
  }

  async getSessionByToken(tokenHash: string): Promise<Session | undefined> {
    const [session] = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash));
    return session || undefined;
  }

  async createSession(session: InsertSession): Promise<Session> {
    const [newSession] = await db.insert(sessions).values(session).returning();
    return newSession;
  }

  async updateSession(id: number, updates: Partial<Session>): Promise<Session | undefined> {
    const [session] = await db.update(sessions).set(updates).where(eq(sessions.id, id)).returning();
    return session || undefined;
  }

  async deleteSession(id: number): Promise<boolean> {
    const result = await db.delete(sessions).where(eq(sessions.id, id));
    return true;
  }

  async deleteUserSessions(userId: number): Promise<boolean> {
    await db.delete(sessions).where(eq(sessions.userId, userId));
    return true;
  }

  // ========== USER PROFILES ==========
  async getUserProfile(userId: number): Promise<UserProfile | undefined> {
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
    return profile || undefined;
  }

  async createUserProfile(profile: InsertUserProfile): Promise<UserProfile> {
    const [newProfile] = await db.insert(userProfiles).values(profile).returning();
    return newProfile;
  }

  async updateUserProfile(userId: number, updates: Partial<UserProfile>): Promise<UserProfile | undefined> {
    const [profile] = await db.update(userProfiles).set(updates).where(eq(userProfiles.userId, userId)).returning();
    return profile || undefined;
  }

  // ========== USER SETTINGS ==========
  async getUserSettings(userId: number): Promise<UserSettings | undefined> {
    const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
    return settings || undefined;
  }

  async createUserSettings(settings: InsertUserSettings): Promise<UserSettings> {
    const [newSettings] = await db.insert(userSettings).values(settings).returning();
    return newSettings;
  }

  async updateUserSettings(userId: number, updates: Partial<UserSettings>): Promise<UserSettings | undefined> {
    const [settings] = await db.update(userSettings).set(updates).where(eq(userSettings.userId, userId)).returning();
    return settings || undefined;
  }

  // ========== WALLETS ==========
  async getWallets(userId: number): Promise<Wallet[]> {
    return db.select().from(wallets).where(eq(wallets.userId, userId)).orderBy(desc(wallets.createdAt));
  }

  async getWallet(id: number): Promise<Wallet | undefined> {
    const [wallet] = await db.select().from(wallets).where(eq(wallets.id, id));
    return wallet || undefined;
  }

  async createWallet(wallet: InsertWallet): Promise<Wallet> {
    const [newWallet] = await db.insert(wallets).values(wallet).returning();
    return newWallet;
  }

  async updateWallet(id: number, updates: Partial<Wallet>): Promise<Wallet | undefined> {
    const [wallet] = await db.update(wallets).set({ ...updates, updatedAt: new Date() }).where(eq(wallets.id, id)).returning();
    return wallet || undefined;
  }

  async deleteWallet(id: number): Promise<boolean> {
    await db.delete(wallets).where(eq(wallets.id, id));
    return true;
  }

  // ========== WALLET KEYS ==========
  async getWalletKey(walletId: number): Promise<WalletKey | undefined> {
    const [key] = await db.select().from(walletKeys).where(eq(walletKeys.walletId, walletId));
    return key || undefined;
  }

  async createWalletKey(key: InsertWalletKey): Promise<WalletKey> {
    const [newKey] = await db.insert(walletKeys).values(key).returning();
    return newKey;
  }

  async updateWalletKey(walletId: number, updates: Partial<WalletKey>): Promise<WalletKey | undefined> {
    const [key] = await db.update(walletKeys).set(updates).where(eq(walletKeys.walletId, walletId)).returning();
    return key || undefined;
  }

  // ========== TRANSACTIONS ==========
  async getTransactions(walletId: number): Promise<Transaction[]> {
    return db.select().from(transactions).where(eq(transactions.walletId, walletId)).orderBy(desc(transactions.date));
  }

  async getTransaction(id: number): Promise<Transaction | undefined> {
    const [transaction] = await db.select().from(transactions).where(eq(transactions.id, id));
    return transaction || undefined;
  }

  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const [newTransaction] = await db.insert(transactions).values(transaction).returning();
    return newTransaction;
  }

  async updateTransaction(id: number, updates: Partial<Transaction>): Promise<Transaction | undefined> {
    const [transaction] = await db.update(transactions).set(updates).where(eq(transactions.id, id)).returning();
    return transaction || undefined;
  }

  // ========== CASES ==========
  async getCases(userId: number): Promise<Case[]> {
    return db.select().from(cases).where(eq(cases.userId, userId)).orderBy(desc(cases.updatedAt));
  }

  async getCase(id: number): Promise<Case | undefined> {
    const [caseData] = await db.select().from(cases).where(eq(cases.id, id));
    return caseData || undefined;
  }

  async createCase(caseData: InsertCase): Promise<Case> {
    const [newCase] = await db.insert(cases).values(caseData).returning();
    return newCase;
  }

  async updateCase(id: number, updates: Partial<Case>): Promise<Case | undefined> {
    const [caseData] = await db.update(cases).set({ ...updates, updatedAt: new Date() }).where(eq(cases.id, id)).returning();
    return caseData || undefined;
  }

  async deleteCase(id: number): Promise<boolean> {
    await db.delete(cases).where(eq(cases.id, id));
    return true;
  }

  // ========== DOCUMENTS ==========
  async getDocuments(userId: number, caseId?: number): Promise<Document[]> {
    if (caseId) {
      return db.select().from(documents).where(and(eq(documents.userId, userId), eq(documents.caseId, caseId))).orderBy(desc(documents.updatedAt));
    }
    return db.select().from(documents).where(eq(documents.userId, userId)).orderBy(desc(documents.updatedAt));
  }

  async getDocument(id: number): Promise<Document | undefined> {
    const [document] = await db.select().from(documents).where(eq(documents.id, id));
    return document || undefined;
  }

  async createDocument(document: InsertDocument): Promise<Document> {
    const [newDocument] = await db.insert(documents).values(document).returning();
    return newDocument;
  }

  async updateDocument(id: number, updates: Partial<Document>): Promise<Document | undefined> {
    const [document] = await db.update(documents).set({ ...updates, updatedAt: new Date() }).where(eq(documents.id, id)).returning();
    return document || undefined;
  }

  async deleteDocument(id: number): Promise<boolean> {
    await db.delete(documents).where(eq(documents.id, id));
    return true;
  }

  // ========== CONTACTS ==========
  async getContacts(userId: number): Promise<Contact[]> {
    return db.select().from(contacts).where(eq(contacts.userId, userId)).orderBy(desc(contacts.createdAt));
  }

  async getContact(id: number): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
    return contact || undefined;
  }

  async createContact(contact: InsertContact): Promise<Contact> {
    const [newContact] = await db.insert(contacts).values(contact).returning();
    return newContact;
  }

  async updateContact(id: number, updates: Partial<Contact>): Promise<Contact | undefined> {
    const [contact] = await db.update(contacts).set(updates).where(eq(contacts.id, id)).returning();
    return contact || undefined;
  }

  async deleteContact(id: number): Promise<boolean> {
    await db.delete(contacts).where(eq(contacts.id, id));
    return true;
  }

  // ========== CONVERSATIONS ==========
  async getConversations(userId: string): Promise<Conversation[]> {
    return db.select()
      .from(conversations)
      .where(sql`${conversations.participants}::text[] @> ARRAY[${userId}]::text[]`)
      .orderBy(desc(conversations.lastMessageTime));
  }

  async getConversation(id: number): Promise<Conversation | undefined> {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conversation || undefined;
  }

  async createConversation(conversation: InsertConversation): Promise<Conversation> {
    const [newConversation] = await db.insert(conversations).values(conversation).returning();
    return newConversation;
  }

  async updateConversation(id: number, updates: Partial<Conversation>): Promise<Conversation | undefined> {
    const [conversation] = await db.update(conversations).set({ ...updates, updatedAt: new Date() }).where(eq(conversations.id, id)).returning();
    return conversation || undefined;
  }

  async createDirectConversation(userId: number, targetUserId: number, targetPublicKey?: string, userPublicKey?: string): Promise<Conversation> {
    // 1. Create conversation
    const conversation = await this.createConversation({
      participants: [String(userId), String(targetUserId)],
      isEncrypted: true,
    });

    const user1 = await this.getUser(userId);
    const user2 = await this.getUser(targetUserId);

    if (user1 && user2) {
      // 2. Create contact for user1 pointing to user2
      await this.createContact({
        userId: userId,
        targetUserId: targetUserId,
        encryptedData: "{}",
        nameBlindIndex: "auto_contact_" + targetUserId,
        status: "online",
        publicKey: targetPublicKey || user2.publicKey || undefined,
      } as any);

      // 3. Create contact for user2 pointing to user1
      await this.createContact({
        userId: targetUserId,
        targetUserId: userId,
        encryptedData: "{}",
        nameBlindIndex: "auto_contact_" + userId,
        status: "online",
        publicKey: userPublicKey || user1.publicKey || undefined,
      } as any);
    }

    return conversation;
  }

  // ========== MESSAGES ==========
  async getMessages(conversationId: number): Promise<Message[]> {
    return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(asc(messages.createdAt));
  }

  async getMessage(id: number): Promise<Message | undefined> {
    const [message] = await db.select().from(messages).where(eq(messages.id, id));
    return message || undefined;
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const [newMessage] = await db.insert(messages).values(message).returning();
    
    // Update conversation
    await db.update(conversations).set({
      lastMessage: message.contentEncrypted.substring(0, 100),
      lastMessageTime: new Date(),
      unreadCount: sql`${conversations.unreadCount} + 1`,
      updatedAt: new Date(),
    }).where(eq(conversations.id, message.conversationId));
    
    return newMessage;
  }

  async updateMessage(id: number, updates: Partial<Message>): Promise<Message | undefined> {
    const [message] = await db.update(messages).set(updates).where(eq(messages.id, id)).returning();
    return message || undefined;
  }

  // ========== ACCOUNTING ENTRIES ==========
  async getAccountingEntries(userId: number): Promise<AccountingEntry[]> {
    return db.select().from(accountingEntries).where(eq(accountingEntries.userId, userId)).orderBy(desc(accountingEntries.date));
  }

  async getAccountingEntry(id: number): Promise<AccountingEntry | undefined> {
    const [entry] = await db.select().from(accountingEntries).where(eq(accountingEntries.id, id));
    return entry || undefined;
  }

  async createAccountingEntry(entry: InsertAccountingEntry): Promise<AccountingEntry> {
    const [newEntry] = await db.insert(accountingEntries).values(entry).returning();
    return newEntry;
  }

  async updateAccountingEntry(id: number, updates: Partial<AccountingEntry>): Promise<AccountingEntry | undefined> {
    const [entry] = await db.update(accountingEntries).set(updates).where(eq(accountingEntries.id, id)).returning();
    return entry || undefined;
  }

  async deleteAccountingEntry(id: number): Promise<boolean> {
    await db.delete(accountingEntries).where(eq(accountingEntries.id, id));
    return true;
  }

  // ========== CALL SESSIONS ==========
  async getCallSessions(userId: string): Promise<CallSession[]> {
    return db.select().from(callSessions).orderBy(desc(callSessions.startTime));
  }

  async getCallSession(id: number): Promise<CallSession | undefined> {
    const [session] = await db.select().from(callSessions).where(eq(callSessions.id, id));
    return session || undefined;
  }

  async createCallSession(session: InsertCallSession): Promise<CallSession> {
    const [newSession] = await db.insert(callSessions).values(session).returning();
    return newSession;
  }

  async updateCallSession(id: number, updates: Partial<CallSession>): Promise<CallSession | undefined> {
    const [session] = await db.update(callSessions).set(updates).where(eq(callSessions.id, id)).returning();
    return session || undefined;
  }

  // ========== PRESENTATIONS ==========
  async getPresentations(userId: number): Promise<Presentation[]> {
    return db.select().from(presentations).where(eq(presentations.userId, userId)).orderBy(desc(presentations.updatedAt));
  }

  async getPresentation(id: number): Promise<Presentation | undefined> {
    const [presentation] = await db.select().from(presentations).where(eq(presentations.id, id));
    return presentation || undefined;
  }

  async createPresentation(presentation: InsertPresentation): Promise<Presentation> {
    const [newPresentation] = await db.insert(presentations).values(presentation).returning();
    return newPresentation;
  }

  async updatePresentation(id: number, updates: Partial<Presentation>): Promise<Presentation | undefined> {
    const [presentation] = await db.update(presentations).set({ ...updates, updatedAt: new Date() }).where(eq(presentations.id, id)).returning();
    return presentation || undefined;
  }

  async deletePresentation(id: number): Promise<boolean> {
    await db.delete(presentations).where(eq(presentations.id, id));
    return true;
  }

  // ========== SLIDES ==========
  async getSlides(presentationId: number): Promise<Slide[]> {
    return db.select().from(slides).where(eq(slides.presentationId, presentationId)).orderBy(asc(slides.order));
  }

  async getSlide(id: number): Promise<Slide | undefined> {
    const [slide] = await db.select().from(slides).where(eq(slides.id, id));
    return slide || undefined;
  }

  async createSlide(slide: InsertSlide): Promise<Slide> {
    const [newSlide] = await db.insert(slides).values(slide).returning();
    
    // Update presentation slide count
    await db.update(presentations).set({
      slideCount: sql`${presentations.slideCount} + 1`,
      updatedAt: new Date(),
    }).where(eq(presentations.id, slide.presentationId));
    
    return newSlide;
  }

  async updateSlide(id: number, updates: Partial<Slide>): Promise<Slide | undefined> {
    const [slide] = await db.update(slides).set(updates).where(eq(slides.id, id)).returning();
    return slide || undefined;
  }

  async deleteSlide(id: number): Promise<boolean> {
    const slide = await this.getSlide(id);
    if (slide) {
      await db.delete(slides).where(eq(slides.id, id));
      await db.update(presentations).set({
        slideCount: sql`${presentations.slideCount} - 1`,
        updatedAt: new Date(),
      }).where(eq(presentations.id, slide.presentationId));
    }
    return true;
  }

  // ========== SLIDE ELEMENTS ==========
  async getSlideElements(slideId: number): Promise<SlideElement[]> {
    return db.select().from(slideElements).where(eq(slideElements.slideId, slideId)).orderBy(asc(slideElements.zIndex));
  }

  async getSlideElement(id: number): Promise<SlideElement | undefined> {
    const [element] = await db.select().from(slideElements).where(eq(slideElements.id, id));
    return element || undefined;
  }

  async createSlideElement(element: InsertSlideElement): Promise<SlideElement> {
    const [newElement] = await db.insert(slideElements).values(element).returning();
    return newElement;
  }

  async updateSlideElement(id: number, updates: Partial<SlideElement>): Promise<SlideElement | undefined> {
    const [element] = await db.update(slideElements).set(updates).where(eq(slideElements.id, id)).returning();
    return element || undefined;
  }

  async deleteSlideElement(id: number): Promise<boolean> {
    await db.delete(slideElements).where(eq(slideElements.id, id));
    return true;
  }

  // ========== AI JOBS ==========
  async getAIJobs(userId: number): Promise<AIJob[]> {
    return db.select().from(aiJobs).where(eq(aiJobs.userId, userId)).orderBy(desc(aiJobs.createdAt));
  }

  async getAIJob(id: number): Promise<AIJob | undefined> {
    const [job] = await db.select().from(aiJobs).where(eq(aiJobs.id, id));
    return job || undefined;
  }

  async createAIJob(job: InsertAIJob): Promise<AIJob> {
    const [newJob] = await db.insert(aiJobs).values(job).returning();
    return newJob;
  }

  async updateAIJob(id: number, updates: Partial<AIJob>): Promise<AIJob | undefined> {
    const [job] = await db.update(aiJobs).set(updates).where(eq(aiJobs.id, id)).returning();
    return job || undefined;
  }

  // ========== RATE LIMITING ==========
  async getRateLimit(key: string): Promise<RateLimit | undefined> {
    const [limit] = await db.select().from(rateLimits).where(eq(rateLimits.key, key));
    return limit || undefined;
  }

  async createOrUpdateRateLimit(key: string, expiresAt: Date): Promise<RateLimit> {
    const existing = await this.getRateLimit(key);
    
    if (existing) {
      if (existing.expiresAt < new Date()) {
        // Reset if expired
        const [updated] = await db.update(rateLimits).set({
          count: 1,
          windowStart: new Date(),
          expiresAt,
        }).where(eq(rateLimits.key, key)).returning();
        return updated;
      } else {
        // Increment counter
        const [updated] = await db.update(rateLimits).set({
          count: sql`${rateLimits.count} + 1`,
        }).where(eq(rateLimits.key, key)).returning();
        return updated;
      }
    } else {
      // Create new
      const [newLimit] = await db.insert(rateLimits).values({
        key,
        count: 1,
        windowStart: new Date(),
        expiresAt,
      }).returning();
      return newLimit;
    }
  }

  async cleanExpiredRateLimits(): Promise<void> {
    await db.delete(rateLimits).where(lte(rateLimits.expiresAt, new Date()));
  }

  // ========== CHAT INVITES ==========
  async getChatInvite(code: string): Promise<ChatInvite | undefined> {
    const [invite] = await db.select().from(chatInvites).where(eq(chatInvites.code, code));
    return invite || undefined;
  }

  async getChatInviteById(id: number): Promise<ChatInvite | undefined> {
    const [invite] = await db.select().from(chatInvites).where(eq(chatInvites.id, id));
    return invite || undefined;
  }

  async getUserChatInvites(userId: number): Promise<ChatInvite[]> {
    return db.select().from(chatInvites).where(eq(chatInvites.creatorId, userId)).orderBy(desc(chatInvites.createdAt));
  }

  async createChatInvite(invite: InsertChatInvite): Promise<ChatInvite> {
    const [created] = await db.insert(chatInvites).values(invite).returning();
    return created;
  }

  async updateChatInvite(id: number, updates: Partial<ChatInvite>): Promise<ChatInvite | undefined> {
    const [updated] = await db.update(chatInvites).set(updates).where(eq(chatInvites.id, id)).returning();
    return updated || undefined;
  }

  // ========== NOTIFICATIONS ==========
  async getNotifications(userId: number, limit: number = 50): Promise<Notification[]> {
    return db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  async getUnreadNotificationCount(userId: number): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    return Number(result[0]?.count || 0);
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [created] = await db.insert(notifications).values(notification).returning();
    return created;
  }

  async markNotificationAsRead(id: number): Promise<Notification | undefined> {
    const [updated] = await db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id))
      .returning();
    return updated || undefined;
  }

  async markAllNotificationsAsRead(userId: number): Promise<void> {
    await db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId));
  }

  async deleteNotification(id: number): Promise<boolean> {
    const result = await db.delete(notifications).where(eq(notifications.id, id)).returning();
    return result.length > 0;
  }

  // ========== STUDIO GRAPH STATES (NeoGraph Canvas) ==========
  async getStudioGraphState(userId: number): Promise<StudioGraphState | undefined> {
    const [state] = await db.select()
      .from(studioGraphStates)
      .where(eq(studioGraphStates.userId, userId))
      .orderBy(desc(studioGraphStates.updatedAt))
      .limit(1);
    return state || undefined;
  }

  async saveStudioGraphState(userId: number, graphData: string, title?: string): Promise<StudioGraphState> {
    const existing = await this.getStudioGraphState(userId);
    if (existing) {
      const [updated] = await db.update(studioGraphStates)
        .set({
          graphData,
          title: title || existing.title,
          updatedAt: new Date(),
        })
        .where(eq(studioGraphStates.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db.insert(studioGraphStates)
      .values({
        userId,
        title: title || "Universal Legal Canvas",
        graphData,
      })
      .returning();
    return created;
  }

  // ========== AI CHAT CONVERSATIONS & MESSAGES ==========
  async getAIConversations(userId: number): Promise<AIConversation[]> {
    return db.select()
      .from(aiConversations)
      .where(eq(aiConversations.userId, userId))
      .orderBy(desc(aiConversations.updatedAt));
  }

  async getAIConversation(id: number): Promise<AIConversation | undefined> {
    const [conv] = await db.select().from(aiConversations).where(eq(aiConversations.id, id));
    return conv || undefined;
  }

  async createAIConversation(conv: InsertAIConversation): Promise<AIConversation> {
    const [created] = await db.insert(aiConversations).values(conv).returning();
    return created;
  }

  async updateAIConversation(id: number, updates: Partial<AIConversation>): Promise<AIConversation | undefined> {
    const [updated] = await db.update(aiConversations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(aiConversations.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteAIConversation(id: number): Promise<boolean> {
    const result = await db.delete(aiConversations).where(eq(aiConversations.id, id)).returning();
    return result.length > 0;
  }

  async getAIChatMessages(conversationId: number): Promise<AIChatMessage[]> {
    return db.select()
      .from(aiChatMessages)
      .where(eq(aiChatMessages.conversationId, conversationId))
      .orderBy(asc(aiChatMessages.createdAt));
  }

  async createAIChatMessage(msg: InsertAIChatMessage): Promise<AIChatMessage> {
    const [created] = await db.insert(aiChatMessages).values(msg).returning();
    // Also bump conversation updatedAt
    await db.update(aiConversations)
      .set({ updatedAt: new Date() })
      .where(eq(aiConversations.id, msg.conversationId));
    return created;
  }

  async deleteAIChatMessages(conversationId: number): Promise<boolean> {
    const result = await db.delete(aiChatMessages).where(eq(aiChatMessages.conversationId, conversationId)).returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
