import { drizzle } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "@shared/schema";
import path from "path";

// PGLite will store data persistently in the .zenlecs_db folder in the current working directory or electron app data
const basePath = process.env.ZENLECS_DATA_PATH || process.cwd();
const dbPath = path.join(basePath, ".zenlecs_db");

// Native Embedded PostgreSQL Database Client
export const client = new PGlite(dbPath);

// Drizzle ORM Instance connected to the embedded DB
export const db = drizzle(client, { schema });
