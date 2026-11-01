ALTER TABLE "studio_graph_states" ADD COLUMN IF NOT EXISTS "undo_stack" text;
--> statement-breakpoint
ALTER TABLE "studio_graph_states" ADD COLUMN IF NOT EXISTS "matter_canvas_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflows" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "name" text NOT NULL,
  "graph_json" text NOT NULL,
  "allow_write" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "workflow_id" text NOT NULL,
  "user_id" integer NOT NULL,
  "status" varchar(32) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "run_steps" (
  "id" text PRIMARY KEY NOT NULL,
  "run_id" text NOT NULL,
  "node_id" text NOT NULL,
  "status" varchar(32) NOT NULL,
  "output_json" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "connector_accounts" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "connector_id" text NOT NULL,
  "token_cipher" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approvals" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "run_id" text,
  "effect" varchar(16) NOT NULL,
  "status" varchar(16) NOT NULL,
  "payload_json" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "run_id" text,
  "connector_id" text,
  "tool" text,
  "params_summary" text,
  "result_summary" text,
  "approval_id" text,
  "prev_hash" text NOT NULL,
  "entry_hash" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dossier_files" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "node_id" text,
  "filename" text NOT NULL,
  "checksum" text NOT NULL,
  "vault_blob_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dossier_file_versions" (
  "id" text PRIMARY KEY NOT NULL,
  "file_id" text NOT NULL,
  "version" integer NOT NULL,
  "checksum" text NOT NULL,
  "vault_blob_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
