ALTER TABLE "contacts" ADD COLUMN "is_blocked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "archived_by" text[];--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "deleted_by" text[];