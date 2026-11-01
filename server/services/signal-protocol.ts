import crypto from "crypto";

/**
 * Signal-Grade E2E Communication: Server-Side Session Coordinator
 * 
 * IMPORTANT SECURITY NOTE:
 * Actual encryption/decryption MUST happen client-side via WebCrypto API.
 * The server NEVER sees plaintext messages or private keys.
 * This module only:
 *   1. Coordinates key exchange (stores public keys for handshake)
 *   2. Relays opaque encrypted envelopes between participants
 *   3. Manages session lifecycle (creation, destruction, metadata)
 * 
 * Client-side implementation should use:
 *   - libsodium-wrappers (or tweetnacl) for X25519 + XSalsa20-Poly1305
 *   - SubtleCrypto for AES-256-GCM per-message encryption
 *   - Double Ratchet key rotation in the browser/renderer process
 */

export interface E2ESession {
  sessionId: string;
  initiatorId: number;
  responderId: number | null;
  initiatorPublicKey: string;   // hex — public key only, never private
  responderPublicKey: string | null;
  status: "pending" | "established" | "closed";
  messageCount: number;
  createdAt: string;
  establishedAt: string | null;
}

export class SignalCoordinatorService {
  private static instance: SignalCoordinatorService;
  private sessions: Map<string, E2ESession> = new Map();

  private constructor() {}

  public static getInstance(): SignalCoordinatorService {
    if (!SignalCoordinatorService.instance) {
      SignalCoordinatorService.instance = new SignalCoordinatorService();
    }
    return SignalCoordinatorService.instance;
  }

  /**
   * Initiator creates a session and publishes their public key
   * Private key NEVER leaves the client.
   */
  public createSession(sessionId: string, initiatorId: number, initiatorPublicKey: string): E2ESession {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} already exists`);
    }

    const session: E2ESession = {
      sessionId,
      initiatorId,
      responderId: null,
      initiatorPublicKey,
      responderPublicKey: null,
      status: "pending",
      messageCount: 0,
      createdAt: new Date().toISOString(),
      establishedAt: null,
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Responder joins the session and publishes their public key.
   * Both sides now have each other's public key for DH key agreement (client-side).
   */
  public joinSession(sessionId: string, responderId: number, responderPublicKey: string): E2ESession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    if (session.status !== "pending") throw new Error("Session already established or closed");

    session.responderId = responderId;
    session.responderPublicKey = responderPublicKey;
    session.status = "established";
    session.establishedAt = new Date().toISOString();

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Get the remote party's public key for client-side DH derivation
   */
  public getRemotePublicKey(sessionId: string, requesterId: number): string | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    if (requesterId === session.initiatorId) {
      return session.responderPublicKey;
    } else if (requesterId === session.responderId) {
      return session.initiatorPublicKey;
    }
    return null;
  }

  /**
   * Record that a message was relayed (for audit/rate-limiting, not content)
   */
  public recordMessage(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messageCount++;
    }
  }

  /**
   * Close and destroy a session
   */
  public closeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  public getSession(sessionId: string): E2ESession | null {
    return this.sessions.get(sessionId) || null;
  }

  public listSessions(userId?: number): E2ESession[] {
    const all = Array.from(this.sessions.values());
    if (userId !== undefined) {
      return all.filter(s => s.initiatorId === userId || s.responderId === userId);
    }
    return all;
  }
}

export const signalCoordinator = SignalCoordinatorService.getInstance();
