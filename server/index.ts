import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import crypto from "crypto";
import { initializeCrypto } from "./crypto";
import { migrate } from "drizzle-orm/pglite/migrator";
import { db } from "./db";
const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Loopback bearer token guard — prevents same-machine lateral access
// When running inside Electron, ZENOS_LOOPBACK_SECRET is injected by the main process
app.use((req: Request, res: Response, next: NextFunction) => {
  const loopbackSecret = process.env.ZENOS_LOOPBACK_SECRET;

  // Only enforce when the secret is set (i.e., Electron mode)
  if (loopbackSecret) {
    // Validate Host header strictly to 127.0.0.1 / localhost to prevent DNS rebinding attacks
    const host = req.headers.host || "";
    if (!host.startsWith("127.0.0.1:") && !host.startsWith("localhost:")) {
      return res.status(403).json({ message: "Forbidden: invalid host" });
    }

    // Allow WebSocket upgrade requests (authenticated strictly in websocket.ts with cookie + origin + token)
    if (req.headers.upgrade === "websocket") {
      return next();
    }

    // Validate Origin header — enforce zenos-electron or local origin; reject empty origin when loopback guard is active
    const origin = req.headers.origin;
    const isDev = process.env.NODE_ENV !== "production";
    const isAllowedOrigin = origin && (
      origin === "zenos-electron" || 
      origin === "http://127.0.0.1" || 
      origin.startsWith("http://127.0.0.1:") ||
      (isDev && (origin === "http://localhost" || origin.startsWith("http://localhost:")))
    );
    if (!isAllowedOrigin) {
      return res.status(403).json({ message: "Forbidden: invalid origin" });
    }

    // Validate bearer token with timingSafeEqual against timing attacks
    const authHeader = req.headers.authorization;
    const expected = `Bearer ${loopbackSecret}`;
    if (
      !authHeader ||
      authHeader.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
    ) {
      return res.status(401).json({ message: "Unauthorized: invalid loopback token" });
    }
  }

  next();
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      // Sensitive data protection: never print response body payloads to console logs
      const logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      log(logLine);
    }
  });

  next();
});

export const initPromise = (async () => {
  // Initialize crypto - fails fast if encryption secrets are not configured
  try {
    initializeCrypto();
    
    log("Running Drizzle Migrations for PGLite...");
    const migrationsFolder = process.env.ZENLECS_MIGRATIONS_PATH || "./migrations";
    await migrate(db, { migrationsFolder });
    log("Migrations completed successfully.");
  } catch (error) {
    console.error("CRITICAL ERROR:", error);
    process.exit(1);
  }

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    log(`[Error Handler] ${status} - ${message}`, "express");
    res.status(status).json({ message });
  });

  if (!process.versions.electron) {
    const port = parseInt(process.env.PORT || "5000", 10);
    httpServer.listen(port, "0.0.0.0", () => {
      log(`serving on port ${port}`);
    });
  }
})();

export { app, httpServer };
