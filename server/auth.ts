import { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { 
  hashAuthKey, 
  verifyAuthKey, 
  generateSessionToken, 
  hashSessionToken, 
  generateCSRFToken
} from "./crypto";
import crypto from "crypto";
import type { User, Session } from "@shared/schema";

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
      session?: Session;
      csrfToken?: string;
    }
  }
}

// Session configuration
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SESSION_COOKIE_NAME = "zenos_session";

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = 1000; // requests per window
const LOGIN_RATE_LIMIT_MAX = 50; // login attempts per window

// CSRF configuration
const CSRF_COOKIE_NAME = "zenos_csrf";
const CSRF_HEADER_NAME = "x-csrf-token";

// Rate limiting middleware supporting both direct use `rateLimit` and factory use `rateLimit({ windowMs, max })`
export function rateLimit(arg1?: any, arg2?: any, arg3?: any): any {
  // If invoked directly as middleware: rateLimit(req, res, next)
  if (arg1 && arg1.socket && typeof arg3 === "function") {
    return createRateLimitMiddleware()(arg1, arg2, arg3);
  }

  // If invoked as factory: rateLimit({ windowMs, max })
  const options = arg1 as { windowMs?: number; max?: number } | undefined;
  return createRateLimitMiddleware(options);
}

function createRateLimitMiddleware(options?: { windowMs?: number; max?: number }) {
  const windowMs = options?.windowMs || RATE_LIMIT_WINDOW_MS;
  const configuredMax = options?.max;

  return async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const key = `rate:${ip}:${req.path}`;
    
    try {
      const expiresAt = new Date(Date.now() + windowMs);
      const limit = await storage.createOrUpdateRateLimit(key, expiresAt);
      
      const maxRequests = configuredMax !== undefined
        ? configuredMax
        : (req.path.includes("/auth/login") ? LOGIN_RATE_LIMIT_MAX : RATE_LIMIT_MAX_REQUESTS);
      
      if (limit.count > maxRequests) {
        return res.status(429).json({ 
          error: "Çok fazla istek gönderildi. Lütfen daha sonra tekrar deneyin.",
          retryAfter: Math.ceil((limit.expiresAt.getTime() - Date.now()) / 1000)
        });
      }
      
      next();
    } catch (error) {
      next();
    }
  };
}

// CSRF protection middleware - issues token on GET, validates on state-changing requests
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // GET, HEAD, OPTIONS requests don't need CSRF validation
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    // Issue or refresh CSRF token
    let csrfToken = req.cookies?.[CSRF_COOKIE_NAME];
    if (!csrfToken) {
      csrfToken = generateCSRFToken();
      res.cookie(CSRF_COOKIE_NAME, csrfToken, {
        httpOnly: false, // Must be readable by JavaScript
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict" as const,
        maxAge: SESSION_DURATION_MS,
        path: "/",
      });
    }
    req.csrfToken = csrfToken;
    return next();
  }
  
  // For state-changing requests (POST, PUT, PATCH, DELETE), validate CSRF token
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME] as string;
  
  if (!cookieToken || !headerToken) {
    if (process.env.NODE_ENV !== "production") {
      return next();
    }
    return res.status(403).json({ error: "CSRF token eksik." });
  }
  
  // Constant-time comparison to prevent timing attacks
  try {
    const cookieBuffer = Buffer.from(cookieToken);
    const headerBuffer = Buffer.from(headerToken);
    
    if (cookieBuffer.length !== headerBuffer.length || !crypto.timingSafeEqual(cookieBuffer, headerBuffer)) {
      if (process.env.NODE_ENV !== "production") {
        return next();
      }
      return res.status(403).json({ error: "Geçersiz CSRF token." });
    }
  } catch {
    if (process.env.NODE_ENV !== "production") {
      return next();
    }
    return res.status(403).json({ error: "Geçersiz CSRF token formatı." });
  }
  
  req.csrfToken = cookieToken;
  next();
}

// Authentication middleware - validates session
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const sessionToken = req.cookies?.[SESSION_COOKIE_NAME];
  
  if (!sessionToken) {
    return res.status(401).json({ error: "Oturum açmanız gerekiyor." });
  }
  
  try {
    const tokenHash = hashSessionToken(sessionToken);
    const session = await storage.getSessionByToken(tokenHash);
    
    if (!session) {
      res.clearCookie(SESSION_COOKIE_NAME);
      return res.status(401).json({ error: "Geçersiz oturum. Lütfen tekrar giriş yapın." });
    }
    
    // Check if session expired
    if (session.expiresAt < new Date()) {
      await storage.deleteSession(session.id);
      res.clearCookie(SESSION_COOKIE_NAME);
      return res.status(401).json({ error: "Oturum süresi doldu. Lütfen tekrar giriş yapın." });
    }
    
    // Get user
    const user = await storage.getUser(session.userId);
    if (!user || !user.isActive) {
      await storage.deleteSession(session.id);
      res.clearCookie(SESSION_COOKIE_NAME);
      return res.status(401).json({ error: "Kullanıcı bulunamadı veya hesap devre dışı." });
    }
    
    // Update session activity
    await storage.updateSession(session.id, { lastActivityAt: new Date() });
    
    // Attach user and session to request
    req.user = user;
    req.session = session;
    
    next();
  } catch (error) {
    console.error("Auth error:", error);
    return res.status(500).json({ error: "Kimlik doğrulama hatası." });
  }
}

// Optional authentication - doesn't fail if no session
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const sessionToken = req.cookies?.[SESSION_COOKIE_NAME];
  
  if (!sessionToken) {
    return next();
  }
  
  try {
    const tokenHash = hashSessionToken(sessionToken);
    const session = await storage.getSessionByToken(tokenHash);
    
    if (session && session.expiresAt >= new Date()) {
      const user = await storage.getUser(session.userId);
      if (user && user.isActive) {
        req.user = user;
        req.session = session;
      }
    }
  } catch (error) {
    // Ignore errors for optional auth
  }
  
  next();
}

// Registration data interface
export interface RegistrationData {
  username?: string | null;
  authKey: string;
  publicKey: string;
  vaultPayload: string;
  displayName?: string;
  phone?: string;
  email?: string;
  isAnonymous?: boolean;
  barAssociationNumber?: string;
  city?: string;
  specializations?: string[];
}

// Register new user with ZKA system
export async function register(
  data: RegistrationData
): Promise<{ user: User }> {
  // Hash the client-derived auth key for verification
  const authKeyHash = await hashAuthKey(data.authKey);
  
  // Extract vaultId
  let defaultUsername = data.username || null;
  if (!defaultUsername) {
    try {
       const vault = JSON.parse(data.vaultPayload);
       if (vault.vaultId) defaultUsername = vault.vaultId;
    } catch(e) {}
  }
  
  // Create user with nullable fields
  const user = await storage.createUser({
    username: defaultUsername,
    email: data.isAnonymous ? null : data.email,
    authKeyHash,
    publicKey: data.publicKey,
    vaultPayload: data.vaultPayload,
    displayName: data.isAnonymous ? null : data.displayName,
    phone: data.phone || null,
    role: "lawyer",
    isAnonymous: data.isAnonymous || false,
    isActive: true,
    twoFactorEnabled: false,
  });
  
  // Create default settings
  await storage.createUserSettings({
    userId: user.id,
    theme: "dark",
    language: "tr",
    timezone: "Europe/Istanbul",
    notificationsEmail: true,
    notificationsPush: true,
    notificationsSound: true,
    sidebarCollapsed: false,
    securityLevel: "standard",
  });
  
  // Create profile with lawyer information
  await storage.createUserProfile({
    userId: user.id,
    encryptedData: "{}", // Default empty payload for ZKA to be updated later by client
  } as any); // Using 'as any' since other plain text fields were removed from schema
  
  return { user };
}

// Get user vault payload for client-side unlocking
export async function getUserVault(identifier: string): Promise<string | null> {
  // Can be username or email
  let user = await storage.getUserByEmail(identifier);
  if (!user) {
    user = await storage.getUserByUsername(identifier);
  }
  
  if (!user || !user.isActive || !user.vaultPayload) {
    return null;
  }
  
  return user.vaultPayload;
}

// Login user with ZKA authKey
export async function loginZKA(
  identifier: string,
  authKey: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ user: User; token: string }> {
  
  // Find user by email or username
  let user = await storage.getUserByEmail(identifier);
  if (!user) {
    user = await storage.getUserByUsername(identifier);
  }
  
  if (!user) {
    throw new Error("Kullanıcı bulunamadı.");
  }
  
  if (!user.isActive) {
    throw new Error("Hesabınız devre dışı bırakılmış.");
  }
  
  // Verify authKey against stored hash
  const validAuth = await verifyAuthKey(authKey, user.authKeyHash);
  if (!validAuth) {
    throw new Error("Kimlik doğrulama başarısız.");
  }
  
  // Generate session
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  
  await storage.createSession({
    userId: user.id,
    tokenHash,
    expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
    ipAddress: ipAddress || null,
    userAgent: userAgent || null,
  });
  
  // Update last login
  await storage.updateUser(user.id, { lastLoginAt: new Date() });
  
  return { user, token };
}

// Logout user
export async function logout(sessionId: number): Promise<void> {
  await storage.deleteSession(sessionId);
}

// Logout all sessions for user
export async function logoutAll(userId: number): Promise<void> {
  await storage.deleteUserSessions(userId);
}

// Change authKey (Requires deriving a new authKey on client)
export async function changeAuthKey(
  userId: number,
  currentAuthKey: string,
  newAuthKey: string,
  newVaultPayload: string
): Promise<void> {
  const user = await storage.getUser(userId);
  if (!user) {
    throw new Error("Kullanıcı bulunamadı.");
  }
  
  const validAuth = await verifyAuthKey(currentAuthKey, user.authKeyHash);
  if (!validAuth) {
    throw new Error("Mevcut kimlik doğrulama anahtarı hatalı.");
  }
  
  const newAuthKeyHash = await hashAuthKey(newAuthKey);
  await storage.updateUser(userId, { 
    authKeyHash: newAuthKeyHash,
    vaultPayload: newVaultPayload // Must update vault since it's encrypted with new password
  });
  
  // Invalidate all sessions except current
  await storage.deleteUserSessions(userId);
}

// Get session cookie options
export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: SESSION_DURATION_MS,
    path: "/",
  };
}

export const SESSION_COOKIE = SESSION_COOKIE_NAME;
export const CSRF_COOKIE = CSRF_COOKIE_NAME;
export const CSRF_HEADER = CSRF_HEADER_NAME;

// Verify session token directly (for WebSocket authentication)
export async function verifySession(sessionToken: string): Promise<{
  userId: number;
  username: string | null;
  sessionId: number;
} | null> {
  try {
    const tokenHash = hashSessionToken(sessionToken);
    const session = await storage.getSessionByToken(tokenHash);
    
    if (!session) {
      return null;
    }
    
    // Check if session expired
    if (session.expiresAt < new Date()) {
      await storage.deleteSession(session.id);
      return null;
    }
    
    // Get user
    const user = await storage.getUser(session.userId);
    if (!user || !user.isActive) {
      return null;
    }
    
    // Update session activity
    await storage.updateSession(session.id, { lastActivityAt: new Date() });
    
    return {
      userId: user.id,
      username: user.username,
      sessionId: session.id
    };
  } catch (error) {
    console.error("Session verification error:", error);
    return null;
  }
}
