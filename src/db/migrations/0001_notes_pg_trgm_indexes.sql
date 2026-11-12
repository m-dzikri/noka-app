CREATE EXTENSION IF NOT EXISTS "pg_trgm";--> statement-breakpoint
CREATE INDEX "notes_title_trgm_active_idx" ON "notes" USING gin ("title" gin_trgm_ops) WHERE "notes"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "notes_content_trgm_active_idx" ON "notes" USING gin ("content" gin_trgm_ops) WHERE "notes"."deleted_at" IS NULL;
