ALTER TABLE "santa_games" ADD COLUMN "draw_failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "santa_games" ADD COLUMN "draw_failed_reason" text;