import { pgTable, text, varchar, integer, boolean, timestamp, decimal, jsonb, serial } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ========== USERS & AUTH ==========
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 100 }),
  email: varchar("email", { length: 255 }),
  authKeyHash: text("auth_key_hash").notNull(),
  publicKey: text("public_key"), // Added for ZKA E2E messaging
  vaultPayload: text("vault_payload"), // The encrypted ZK Vault containing master keys
  displayName: varchar("display_name", { length: 255 }),
  role: varchar("role", { length: 50 }).notNull().default("lawyer"),
  avatar: text("avatar"),
  phone: varchar("phone", { length: 50 }),
  isAnonymous: boolean("is_anonymous").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at"),
  isActive: boolean("is_active").default(true).notNull(),
  twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
  twoFactorSecret: text("two_factor_secret"),
});

export const usersRelations = relations(users, ({ many, one }) => ({
  sessions: many(sessions),
  profile: one(userProfiles),
  settings: one(userSettings),
  wallets: many(wallets),
  contacts: many(contacts),
  cases: many(cases),
  documents: many(documents),
  presentations: many(presentations),
}));

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
}).extend({
  authKeyHash: z.string().optional(),
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ========== SESSIONS ==========
export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  ipAddress: varchar("ip_address", { length: 50 }),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastActivityAt: timestamp("last_activity_at").defaultNow().notNull(),
});

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
  createdAt: true,
  lastActivityAt: true,
});
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

// ========== USER PROFILES ==========
export const userProfiles = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  
  // ZKA Payload
  encryptedData: text("encrypted_data").notNull(), // Contains address, city, country, barAssociationNumber, specializations, bio, website, linkedIn
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(users, {
    fields: [userProfiles.userId],
    references: [users.id],
  }),
}));

export const insertUserProfileSchema = createInsertSchema(userProfiles).omit({
  id: true,
});
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type UserProfile = typeof userProfiles.$inferSelect;

// ========== USER SETTINGS ==========
export const userSettings = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  theme: varchar("theme", { length: 20 }).default("dark").notNull(),
  language: varchar("language", { length: 10 }).default("tr").notNull(),
  timezone: varchar("timezone", { length: 50 }).default("Europe/Istanbul").notNull(),
  notificationsEmail: boolean("notifications_email").default(true).notNull(),
  notificationsPush: boolean("notifications_push").default(true).notNull(),
  notificationsSound: boolean("notifications_sound").default(true).notNull(),
  sidebarCollapsed: boolean("sidebar_collapsed").default(false).notNull(),
  dashboardLayout: jsonb("dashboard_layout"),
  securityLevel: varchar("security_level", { length: 20 }).default("standard").notNull(),
});

export const userSettingsRelations = relations(userSettings, ({ one }) => ({
  user: one(users, {
    fields: [userSettings.userId],
    references: [users.id],
  }),
}));

export const insertUserSettingsSchema = createInsertSchema(userSettings).omit({
  id: true,
});
export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;
export type UserSettings = typeof userSettings.$inferSelect;

// ========== WALLETS ==========
export const wallets = pgTable("wallets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // ZKA Payload
  encryptedData: text("encrypted_data").notNull(), // Contains name, balance, icon, address, provider, color
  
  type: varchar("type", { length: 20 }).notNull(), // fiat, crypto
  currency: varchar("currency", { length: 20 }).notNull(),
  isSetup: boolean("is_setup").default(false).notNull(),
  source: varchar("source", { length: 20 }), // generated, imported, tracking
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const walletsRelations = relations(wallets, ({ one, many }) => ({
  user: one(users, {
    fields: [wallets.userId],
    references: [users.id],
  }),
  walletKeys: one(walletKeys),
  transactions: many(transactions),
}));

export const insertWalletSchema = createInsertSchema(wallets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertWallet = z.infer<typeof insertWalletSchema>;
export type Wallet = typeof wallets.$inferSelect;

// ========== WALLET KEYS (Encrypted) ==========
export const walletKeys = pgTable("wallet_keys", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").notNull().unique().references(() => wallets.id, { onDelete: "cascade" }),
  encryptedPrivateKey: text("encrypted_private_key"), // AES-256-GCM encrypted
  publicKey: text("public_key"),
  derivationPath: varchar("derivation_path", { length: 100 }),
  keyType: varchar("key_type", { length: 50 }), // secp256k1, ed25519
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const walletKeysRelations = relations(walletKeys, ({ one }) => ({
  wallet: one(wallets, {
    fields: [walletKeys.walletId],
    references: [wallets.id],
  }),
}));

export const insertWalletKeySchema = createInsertSchema(walletKeys).omit({
  id: true,
  createdAt: true,
});
export type InsertWalletKey = z.infer<typeof insertWalletKeySchema>;
export type WalletKey = typeof walletKeys.$inferSelect;

// ========== TRANSACTIONS ==========
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").notNull().references(() => wallets.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 20 }).notNull(), // income, expense, transfer
  
  // ZKA Payload
  encryptedData: text("encrypted_data").notNull(), // Contains description, counterparty, reference, txHash, amount
  
  status: varchar("status", { length: 20 }).default("completed").notNull(),
  date: timestamp("date").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const transactionsRelations = relations(transactions, ({ one }) => ({
  wallet: one(wallets, {
    fields: [transactions.walletId],
    references: [wallets.id],
  }),
}));

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  createdAt: true,
});
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;

// ========== CASES ==========
export const cases = pgTable("cases", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // ZKA Payload
  encryptedData: text("encrypted_data").notNull(), // Contains title, description, court, judge, opposingCounsel, nextHearing, caseNumber, clientName
  
  // Blind Indexes for Search
  caseNumberBlindIndex: varchar("case_number_blind_index", { length: 255 }).notNull(),
  clientNameBlindIndex: varchar("client_name_blind_index", { length: 255 }),
  
  status: varchar("status", { length: 50 }).notNull().default("active"), // active, pending, closed, archived
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const casesRelations = relations(cases, ({ one, many }) => ({
  user: one(users, {
    fields: [cases.userId],
    references: [users.id],
  }),
  documents: many(documents),
}));

export const insertCaseSchema = createInsertSchema(cases).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCase = z.infer<typeof insertCaseSchema>;
export type Case = typeof cases.$inferSelect;

// ========== DOCUMENTS ==========
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  caseId: integer("case_id").references(() => cases.id, { onDelete: "set null" }),
  
  // ZKA Payload
  encryptedData: text("encrypted_data").notNull(), // Contains title, content, fileUrl, fileSize, mimeType
  
  type: varchar("type", { length: 50 }).notNull(), // contract, brief, motion, evidence, presentation, other
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const documentsRelations = relations(documents, ({ one }) => ({
  user: one(users, {
    fields: [documents.userId],
    references: [users.id],
  }),
  case: one(cases, {
    fields: [documents.caseId],
    references: [cases.id],
  }),
}));

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

// ========== CONTACTS ==========
export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetUserId: integer("target_user_id"), // The user ID this contact represents
  
  // ZKA Payload
  encryptedData: text("encrypted_data").notNull(), // Contains name, email, phone, avatar
  
  // Blind Index
  nameBlindIndex: varchar("name_blind_index", { length: 255 }).notNull(),
  
  status: varchar("status", { length: 20 }).default("offline").notNull(), // online, offline, away, busy
  publicKey: text("public_key"), // for E2E encryption
  lastSeen: timestamp("last_seen"),
  isBlocked: boolean("is_blocked").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const contactsRelations = relations(contacts, ({ one }) => ({
  user: one(users, {
    fields: [contacts.userId],
    references: [users.id],
  }),
}));

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  createdAt: true,
});
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;

// ========== CONVERSATIONS ==========
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  participants: text("participants").array().notNull(), // user IDs
  lastMessage: text("last_message"),
  lastMessageTime: timestamp("last_message_time"),
  unreadCount: integer("unread_count").default(0).notNull(),
  isEncrypted: boolean("is_encrypted").default(true).notNull(),
  archivedBy: text("archived_by").array(),
  deletedBy: text("deleted_by").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const conversationsRelations = relations(conversations, ({ many }) => ({
  messages: many(messages),
}));

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;

// ========== MESSAGES (E2E Encrypted) ==========
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderId: varchar("sender_id", { length: 50 }).notNull(),
  receiverId: varchar("receiver_id", { length: 50 }).notNull(),
  type: varchar("type", { length: 20 }).notNull().default("text"), // text, file, call, audio
  contentEncrypted: text("content_encrypted").notNull(), // E2E encrypted content
  iv: text("iv"), // Initialization vector for decryption
  audioData: text("audio_data"), // Base64 encoded encrypted audio
  audioDuration: integer("audio_duration"), // Duration in seconds
  
  // ZenConnect Additions
  status: varchar("status", { length: 20 }).default("sent").notNull(), // sent, delivered, read
  replyToId: integer("reply_to_id"), // Self-referencing ID for replies
  attachmentUrl: text("attachment_url"), // URL for encrypted media
  attachmentType: varchar("attachment_type", { length: 50 }), // image, video, file, audio
  
  isRead: boolean("is_read").default(false).notNull(),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// ========== CALL SESSIONS ==========
export const callSessions = pgTable("call_sessions", {
  id: serial("id").primaryKey(),
  participants: text("participants").array().notNull(),
  callType: varchar("call_type", { length: 20 }).notNull().default("audio"), // audio, video
  status: varchar("status", { length: 20 }).notNull().default("active"), // active, ended, missed
  isEncrypted: boolean("is_encrypted").default(true).notNull(),
  startTime: timestamp("start_time").defaultNow().notNull(),
  endTime: timestamp("end_time"),
  duration: integer("duration"), // in seconds
  signalingData: jsonb("signaling_data"), // WebRTC signaling info
});

export const insertCallSessionSchema = createInsertSchema(callSessions).omit({
  id: true,
});
export type InsertCallSession = z.infer<typeof insertCallSessionSchema>;
export type CallSession = typeof callSessions.$inferSelect;

// ========== ACCOUNTING ENTRIES ==========
export const accountingEntries = pgTable("accounting_entries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  walletId: integer("wallet_id").references(() => wallets.id, { onDelete: "set null" }),
  transactionId: integer("transaction_id").references(() => transactions.id, { onDelete: "set null" }),
  
  // ZKA Payload
  encryptedData: text("encrypted_data").notNull(), // Contains description, amount, reference, tags
  
  category: varchar("category", { length: 50 }).notNull(), // income, expense, asset, liability
  date: timestamp("date").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const accountingEntriesRelations = relations(accountingEntries, ({ one }) => ({
  user: one(users, {
    fields: [accountingEntries.userId],
    references: [users.id],
  }),
  wallet: one(wallets, {
    fields: [accountingEntries.walletId],
    references: [wallets.id],
  }),
  transaction: one(transactions, {
    fields: [accountingEntries.transactionId],
    references: [transactions.id],
  }),
}));

export const insertAccountingEntrySchema = createInsertSchema(accountingEntries).omit({
  id: true,
  createdAt: true,
});
export type InsertAccountingEntry = z.infer<typeof insertAccountingEntrySchema>;
export type AccountingEntry = typeof accountingEntries.$inferSelect;

// ========== PRESENTATIONS ==========
export const presentations = pgTable("presentations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // ZKA Payload
  encryptedData: text("encrypted_data").notNull(), // Contains title, description, thumbnail
  
  format: varchar("format", { length: 20 }).notNull().default("pptx"), // pptx, pdf
  status: varchar("status", { length: 20 }).notNull().default("draft"), // draft, completed, generating
  caseId: integer("case_id").references(() => cases.id, { onDelete: "set null" }),
  slideCount: integer("slide_count").default(0).notNull(),
  aiGenerated: boolean("ai_generated").default(false).notNull(),
  sourceDocumentId: integer("source_document_id").references(() => documents.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const presentationsRelations = relations(presentations, ({ one, many }) => ({
  user: one(users, {
    fields: [presentations.userId],
    references: [users.id],
  }),
  case: one(cases, {
    fields: [presentations.caseId],
    references: [cases.id],
  }),
  slides: many(slides),
}));

export const insertPresentationSchema = createInsertSchema(presentations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPresentation = z.infer<typeof insertPresentationSchema>;
export type Presentation = typeof presentations.$inferSelect;

// ========== SLIDES ==========
export const slides = pgTable("slides", {
  id: serial("id").primaryKey(),
  presentationId: integer("presentation_id").notNull().references(() => presentations.id, { onDelete: "cascade" }),
  order: integer("order").notNull(),
  layout: varchar("layout", { length: 50 }).notNull().default("content"),
  title: text("title"),
  notes: text("notes"),
  backgroundColor: varchar("background_color", { length: 50 }),
  backgroundImage: text("background_image"),
});

export const slidesRelations = relations(slides, ({ one, many }) => ({
  presentation: one(presentations, {
    fields: [slides.presentationId],
    references: [presentations.id],
  }),
  elements: many(slideElements),
}));

export const insertSlideSchema = createInsertSchema(slides).omit({
  id: true,
});
export type InsertSlide = z.infer<typeof insertSlideSchema>;
export type Slide = typeof slides.$inferSelect;

// ========== SLIDE ELEMENTS ==========
export const slideElements = pgTable("slide_elements", {
  id: serial("id").primaryKey(),
  slideId: integer("slide_id").notNull().references(() => slides.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(), // text, image, shape, chart, list
  content: text("content").default("").notNull(),
  x: integer("x").default(0).notNull(),
  y: integer("y").default(0).notNull(),
  width: integer("width").default(200).notNull(),
  height: integer("height").default(100).notNull(),
  rotation: integer("rotation").default(0).notNull(),
  zIndex: integer("z_index").default(0).notNull(),
  order: integer("order"),
  style: jsonb("style"),
});

export const slideElementsRelations = relations(slideElements, ({ one }) => ({
  slide: one(slides, {
    fields: [slideElements.slideId],
    references: [slides.id],
  }),
}));

export const insertSlideElementSchema = createInsertSchema(slideElements).omit({
  id: true,
});
export type InsertSlideElement = z.infer<typeof insertSlideElementSchema>;
export type SlideElement = typeof slideElements.$inferSelect;

// ========== AI JOBS ==========
export const aiJobs = pgTable("ai_jobs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  presentationId: integer("presentation_id").references(() => presentations.id, { onDelete: "set null" }),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, processing, completed, failed
  progress: integer("progress").default(0).notNull(),
  inputText: text("input_text"),
  inputFileUrl: text("input_file_url"),
  output: jsonb("output"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const aiJobsRelations = relations(aiJobs, ({ one }) => ({
  user: one(users, {
    fields: [aiJobs.userId],
    references: [users.id],
  }),
  presentation: one(presentations, {
    fields: [aiJobs.presentationId],
    references: [presentations.id],
  }),
}));

export const insertAIJobSchema = createInsertSchema(aiJobs).omit({
  id: true,
  createdAt: true,
});
export type InsertAIJob = z.infer<typeof insertAIJobSchema>;
export type AIJob = typeof aiJobs.$inferSelect;

// ========== RATE LIMITING ==========
export const rateLimits = pgTable("rate_limits", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 255 }).notNull().unique(), // IP:endpoint or userId:endpoint
  count: integer("count").default(0).notNull(),
  windowStart: timestamp("window_start").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const insertRateLimitSchema = createInsertSchema(rateLimits).omit({
  id: true,
});
export type InsertRateLimit = z.infer<typeof insertRateLimitSchema>;
export type RateLimit = typeof rateLimits.$inferSelect;

// ========== ENUMS/CONSTANTS ==========
export const userRoles = ["admin", "lawyer", "paralegal", "accountant"] as const;
export type UserRole = (typeof userRoles)[number];

export const walletTypes = ["fiat", "crypto"] as const;
export type WalletType = (typeof walletTypes)[number];

export const walletSources = ["generated", "imported", "tracking"] as const;
export type WalletSource = (typeof walletSources)[number];

export const transactionTypes = ["income", "expense", "transfer"] as const;
export type TransactionType = (typeof transactionTypes)[number];

export const documentTypes = ["contract", "brief", "motion", "evidence", "presentation", "other"] as const;
export type DocumentType = (typeof documentTypes)[number];

export const caseStatuses = ["active", "pending", "closed", "archived"] as const;
export type CaseStatus = (typeof caseStatuses)[number];

export const messageTypes = ["text", "file", "call"] as const;
export type MessageType = (typeof messageTypes)[number];

export const accountingCategories = ["income", "expense", "asset", "liability"] as const;
export type AccountingCategory = (typeof accountingCategories)[number];

export const presentationFormats = ["pptx", "pdf"] as const;
export type PresentationFormat = (typeof presentationFormats)[number];

export const presentationStatuses = ["draft", "completed", "generating"] as const;
export type PresentationStatus = (typeof presentationStatuses)[number];

export const slideElementTypes = ["text", "image", "shape", "chart", "list"] as const;
export type SlideElementType = (typeof slideElementTypes)[number];

export const slideLayoutTypes = ["title", "content", "two-column", "image-left", "image-right", "blank", "comparison", "timeline"] as const;
export type SlideLayoutType = (typeof slideLayoutTypes)[number];

export const aiJobStatuses = ["pending", "processing", "completed", "failed"] as const;
export type AIJobStatus = (typeof aiJobStatuses)[number];

export const callStatuses = ["active", "ended", "missed"] as const;
export type CallStatus = (typeof callStatuses)[number];

export const contactStatuses = ["online", "offline", "away", "busy"] as const;
export type ContactStatus = (typeof contactStatuses)[number];

// ========== CHAT INVITES ==========
export const chatInvites = pgTable("chat_invites", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  creatorId: integer("creator_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  creatorPublicKey: text("creator_public_key"),
  joinerPublicKey: text("joiner_public_key"),
  conversationId: integer("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, accepted, expired
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chatInvitesRelations = relations(chatInvites, ({ one }) => ({
  creator: one(users, {
    fields: [chatInvites.creatorId],
    references: [users.id],
  }),
  conversation: one(conversations, {
    fields: [chatInvites.conversationId],
    references: [conversations.id],
  }),
}));

export const insertChatInviteSchema = createInsertSchema(chatInvites).omit({
  id: true,
  createdAt: true,
});
export type InsertChatInvite = z.infer<typeof insertChatInviteSchema>;
export type ChatInvite = typeof chatInvites.$inferSelect;

export const inviteStatuses = ["pending", "accepted", "expired"] as const;
export type InviteStatus = (typeof inviteStatuses)[number];

// ========== NOTIFICATIONS ==========
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(), // wallet_transaction, accounting_entry, login
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  icon: varchar("icon", { length: 50 }),
  isRead: boolean("is_read").default(false).notNull(),
  metadata: jsonb("metadata"), // Additional data like transaction ID, amount, etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export const notificationTypes = ["wallet_transaction", "accounting_entry", "login"] as const;
export type NotificationType = (typeof notificationTypes)[number];

// ========== STUDIO GRAPH STATES (Universal NeoGraph Canvas) ==========
export const studioGraphStates = pgTable("studio_graph_states", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).default("Universal Legal Canvas").notNull(),
  graphData: text("graph_data").notNull(), // AES blob; API returns plaintext JSON
  undoStack: text("undo_stack"),
  matterCanvasId: text("matter_canvas_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const studioGraphStatesRelations = relations(studioGraphStates, ({ one }) => ({
  user: one(users, {
    fields: [studioGraphStates.userId],
    references: [users.id],
  }),
}));

export const workflows = pgTable("workflows", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  graphJson: text("graph_json").notNull(),
  allowWrite: boolean("allow_write").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const workflowRuns = pgTable("workflow_runs", {
  id: text("id").primaryKey(),
  workflowId: text("workflow_id").notNull(),
  userId: integer("user_id").notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const runSteps = pgTable("run_steps", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  nodeId: text("node_id").notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  outputJson: text("output_json"),
});

export const connectorAccounts = pgTable("connector_accounts", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull(),
  connectorId: text("connector_id").notNull(),
  tokenCipher: text("token_cipher"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const approvals = pgTable("approvals", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull(),
  runId: text("run_id"),
  effect: varchar("effect", { length: 16 }).notNull(),
  status: varchar("status", { length: 16 }).notNull(),
  payloadJson: text("payload_json").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  runId: text("run_id"),
  connectorId: text("connector_id"),
  tool: text("tool"),
  paramsSummary: text("params_summary"),
  resultSummary: text("result_summary"),
  approvalId: text("approval_id"),
  prevHash: text("prev_hash").notNull(),
  entryHash: text("entry_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const dossierFiles = pgTable("dossier_files", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull(),
  nodeId: text("node_id"),
  filename: text("filename").notNull(),
  checksum: text("checksum").notNull(),
  vaultBlobId: text("vault_blob_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const dossierFileVersions = pgTable("dossier_file_versions", {
  id: text("id").primaryKey(),
  fileId: text("file_id").notNull(),
  version: integer("version").notNull(),
  checksum: text("checksum").notNull(),
  vaultBlobId: text("vault_blob_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertStudioGraphStateSchema = createInsertSchema(studioGraphStates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertStudioGraphState = z.infer<typeof insertStudioGraphStateSchema>;
export type StudioGraphState = typeof studioGraphStates.$inferSelect;

// ========== AI CONVERSATIONS & CHAT MESSAGES ==========
export const aiConversations = pgTable("ai_conversations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).default("Yeni Sohbet").notNull(),
  model: varchar("model", { length: 50 }).default("zenlecs-core").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const aiConversationsRelations = relations(aiConversations, ({ one, many }) => ({
  user: one(users, {
    fields: [aiConversations.userId],
    references: [users.id],
  }),
  messages: many(aiChatMessages),
}));

export const insertAIConversationSchema = createInsertSchema(aiConversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAIConversation = z.infer<typeof insertAIConversationSchema>;
export type AIConversation = typeof aiConversations.$inferSelect;

export const aiChatMessages = pgTable("ai_chat_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => aiConversations.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull(), // 'user' | 'assistant' | 'system'
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const aiChatMessagesRelations = relations(aiChatMessages, ({ one }) => ({
  conversation: one(aiConversations, {
    fields: [aiChatMessages.conversationId],
    references: [aiConversations.id],
  }),
}));

export const insertAIChatMessageSchema = createInsertSchema(aiChatMessages).omit({
  id: true,
  createdAt: true,
});
export type InsertAIChatMessage = z.infer<typeof insertAIChatMessageSchema>;
export type AIChatMessage = typeof aiChatMessages.$inferSelect;
