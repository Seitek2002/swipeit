CREATE TABLE "notifications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"ref_id" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_at" timestamp with time zone DEFAULT now(),
	"attempts" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"error" text,
	CONSTRAINT "notifications_kind" CHECK (kind in ('santa_drawn', 'santa_new_letter', 'santa_draw_failed', 'santa_draw_tomorrow', 'santa_exchange_soon', 'plan_results'))
);
--> statement-breakpoint
ALTER TABLE "identities" ADD COLUMN "chat_id" text;--> statement-breakpoint
ALTER TABLE "identities" ADD COLUMN "bot_messages" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "identities" ADD COLUMN "bot_blocked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_key" ON "notifications" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_next_at" ON "notifications" USING btree ("next_at");--> statement-breakpoint
CREATE INDEX "notifications_user_id" ON "notifications" USING btree ("user_id");