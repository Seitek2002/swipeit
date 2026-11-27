CREATE TABLE "custom_activities" (
	"id" text PRIMARY KEY NOT NULL,
	"created_by" text NOT NULL,
	"activity" jsonb NOT NULL,
	"image_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"user_id" text NOT NULL,
	"friend_id" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friendships_user_id_friend_id_pk" PRIMARY KEY("user_id","friend_id"),
	CONSTRAINT "friendships_source" CHECK (source in ('plan', 'santa', 'wishlist_link')),
	CONSTRAINT "friendships_not_self" CHECK (user_id <> friend_id)
);
--> statement-breakpoint
CREATE TABLE "identities" (
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identities_provider_subject_pk" PRIMARY KEY("provider","subject"),
	CONSTRAINT "identities_provider" CHECK (provider in ('telegram'))
);
--> statement-breakpoint
CREATE TABLE "important_dates" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"date" text NOT NULL,
	"preset" text,
	"label" text,
	"auto_number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "important_dates_date_format" CHECK (date ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')
);
--> statement-breakpoint
CREATE TABLE "pick_answers" (
	"request_id" text NOT NULL,
	"by_user_id" text NOT NULL,
	"picks" jsonb NOT NULL,
	"answered_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pick_answers_request_id_by_user_id_pk" PRIMARY KEY("request_id","by_user_id")
);
--> statement-breakpoint
CREATE TABLE "pick_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"from_user_id" text NOT NULL,
	"to_name" text,
	"filters" jsonb NOT NULL,
	"hide_prices" boolean DEFAULT false NOT NULL,
	"occasion" jsonb,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_participants" (
	"plan_id" text NOT NULL,
	"user_id" text NOT NULL,
	"ready" boolean DEFAULT false NOT NULL,
	"finished" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	CONSTRAINT "plan_participants_plan_id_user_id_pk" PRIMARY KEY("plan_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "plan_swipes" (
	"plan_id" text NOT NULL,
	"user_id" text NOT NULL,
	"activity_id" text NOT NULL,
	"decision" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "plan_swipes_plan_id_user_id_activity_id_pk" PRIMARY KEY("plan_id","user_id","activity_id"),
	CONSTRAINT "plan_swipes_decision" CHECK (decision in ('like', 'pass'))
);
--> statement-breakpoint
CREATE TABLE "plan_votes" (
	"plan_id" text NOT NULL,
	"user_id" text NOT NULL,
	"activity_id" text NOT NULL,
	CONSTRAINT "plan_votes_plan_id_user_id_pk" PRIMARY KEY("plan_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"owner_id" text NOT NULL,
	"mode" text NOT NULL,
	"deadline" timestamp with time zone,
	"status" text NOT NULL,
	"match_rule" text DEFAULT 'all' NOT NULL,
	"filters" jsonb NOT NULL,
	"deck" text[] NOT NULL,
	"custom_activity_ids" text[] DEFAULT '{}' NOT NULL,
	"decision" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_mode" CHECK (mode in ('live', 'deadline')),
	CONSTRAINT "plans_status" CHECK (status in ('lobby', 'swiping', 'results', 'decided')),
	CONSTRAINT "plans_match_rule" CHECK (match_rule in ('all', 'majority')),
	CONSTRAINT "plans_deadline_mode" CHECK (mode = 'live' or deadline is not null)
);
--> statement-breakpoint
CREATE TABLE "product_swipes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"product_id" text NOT NULL,
	"decision" text NOT NULL,
	"context_key" text NOT NULL,
	"pick_request_id" text,
	"variant_choice" jsonb,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "product_swipes_decision" CHECK (decision in ('like', 'superlike', 'pass'))
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_ref" text NOT NULL,
	"item_key" text NOT NULL,
	"reserver_id" text NOT NULL,
	"reserver_name" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "santa_assignments" (
	"game_id" text NOT NULL,
	"santa_id" text NOT NULL,
	"ward_id" text NOT NULL,
	CONSTRAINT "santa_assignments_game_id_santa_id_pk" PRIMARY KEY("game_id","santa_id"),
	CONSTRAINT "santa_assignments_not_self" CHECK (santa_id <> ward_id)
);
--> statement-breakpoint
CREATE TABLE "santa_games" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"owner_id" text NOT NULL,
	"budget" integer NOT NULL,
	"exchange_date" date NOT NULL,
	"draw_at" timestamp with time zone,
	"status" text DEFAULT 'gathering' NOT NULL,
	"exclusions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"drawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "santa_games_status" CHECK (status in ('gathering', 'drawn')),
	CONSTRAINT "santa_games_budget" CHECK (budget >= 0)
);
--> statement-breakpoint
CREATE TABLE "santa_members" (
	"game_id" text NOT NULL,
	"user_id" text NOT NULL,
	"state" text DEFAULT 'invited' NOT NULL,
	"opened_at" timestamp with time zone,
	"bought_at" timestamp with time zone,
	"joined_at" timestamp with time zone,
	CONSTRAINT "santa_members_game_id_user_id_pk" PRIMARY KEY("game_id","user_id"),
	CONSTRAINT "santa_members_state" CHECK (state in ('invited', 'joined'))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"user_agent" varchar(200)
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"code" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"owner_id" text NOT NULL,
	"target_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "share_links_kind" CHECK (kind in ('wishlist', 'pick_request', 'pick_answer', 'plan', 'santa'))
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"key" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"avatar_color" text NOT NULL,
	"birthday" text,
	"interests" text[] DEFAULT '{}' NOT NULL,
	"muted_interests" text[] DEFAULT '{}' NOT NULL,
	"audience" text DEFAULT 'all' NOT NULL,
	"taste" jsonb,
	"seen_hints" text[] DEFAULT '{}' NOT NULL,
	"dismissed_reminders" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_birthday_format" CHECK (birthday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
	CONSTRAINT "users_audience" CHECK (audience in ('all', 'female', 'male'))
);
--> statement-breakpoint
CREATE TABLE "wishlist_items" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"source_kind" text NOT NULL,
	"product_id" text,
	"custom" jsonb,
	"priority" text DEFAULT 'normal' NOT NULL,
	"sort_order" integer NOT NULL,
	"variant_choice" jsonb,
	"note" text,
	"status" text DEFAULT 'active' NOT NULL,
	"given" jsonb,
	"added_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "wishlist_items_source_kind" CHECK (source_kind in ('product', 'custom')),
	CONSTRAINT "wishlist_items_priority" CHECK (priority in ('normal', 'top')),
	CONSTRAINT "wishlist_items_status" CHECK (status in ('active', 'given')),
	CONSTRAINT "wishlist_items_source" CHECK ((source_kind = 'product' and product_id is not null) or (source_kind = 'custom' and custom is not null))
);
--> statement-breakpoint
CREATE TABLE "wishlist_meta" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"occasion" jsonb,
	"message" text,
	"hide_reservation_count" boolean DEFAULT false NOT NULL,
	"share_unlocked_at" timestamp with time zone,
	"dismissed_given_hint_for" text
);
--> statement-breakpoint
ALTER TABLE "custom_activities" ADD CONSTRAINT "custom_activities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_friend_id_users_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identities" ADD CONSTRAINT "identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "important_dates" ADD CONSTRAINT "important_dates_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick_answers" ADD CONSTRAINT "pick_answers_request_id_pick_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."pick_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick_answers" ADD CONSTRAINT "pick_answers_by_user_id_users_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick_requests" ADD CONSTRAINT "pick_requests_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_participants" ADD CONSTRAINT "plan_participants_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_participants" ADD CONSTRAINT "plan_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_swipes" ADD CONSTRAINT "plan_swipes_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_swipes" ADD CONSTRAINT "plan_swipes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_votes" ADD CONSTRAINT "plan_votes_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_votes" ADD CONSTRAINT "plan_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_swipes" ADD CONSTRAINT "product_swipes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_reserver_id_users_id_fk" FOREIGN KEY ("reserver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "santa_assignments" ADD CONSTRAINT "santa_assignments_game_id_santa_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."santa_games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "santa_assignments" ADD CONSTRAINT "santa_assignments_santa_id_users_id_fk" FOREIGN KEY ("santa_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "santa_assignments" ADD CONSTRAINT "santa_assignments_ward_id_users_id_fk" FOREIGN KEY ("ward_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "santa_games" ADD CONSTRAINT "santa_games_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "santa_members" ADD CONSTRAINT "santa_members_game_id_santa_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."santa_games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "santa_members" ADD CONSTRAINT "santa_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_meta" ADD CONSTRAINT "wishlist_meta_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_activities_created_by" ON "custom_activities" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "friendships_friend_id" ON "friendships" USING btree ("friend_id");--> statement-breakpoint
CREATE INDEX "identities_user_id" ON "identities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "important_dates_owner_id" ON "important_dates" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "pick_requests_from_user_id" ON "pick_requests" USING btree ("from_user_id");--> statement-breakpoint
CREATE INDEX "plan_participants_user_id" ON "plan_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "plans_status_deadline" ON "plans" USING btree ("status","deadline");--> statement-breakpoint
CREATE UNIQUE INDEX "product_swipes_user_context_product" ON "product_swipes" USING btree ("user_id","context_key","product_id");--> statement-breakpoint
CREATE INDEX "product_swipes_user_context_at" ON "product_swipes" USING btree ("user_id","context_key","at");--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_owner_item_open" ON "reservations" USING btree ("owner_ref","item_key") WHERE closed_at is null;--> statement-breakpoint
CREATE INDEX "reservations_owner_ref" ON "reservations" USING btree ("owner_ref");--> statement-breakpoint
CREATE INDEX "reservations_reserver_id" ON "reservations" USING btree ("reserver_id");--> statement-breakpoint
CREATE UNIQUE INDEX "santa_assignments_game_ward" ON "santa_assignments" USING btree ("game_id","ward_id");--> statement-breakpoint
CREATE INDEX "santa_games_status_draw_at" ON "santa_games" USING btree ("status","draw_at");--> statement-breakpoint
CREATE INDEX "santa_members_user_id" ON "santa_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_id" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "share_links_kind_target_live" ON "share_links" USING btree ("kind","target_id") WHERE revoked_at is null;--> statement-breakpoint
CREATE INDEX "uploads_owner_id" ON "uploads" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "wishlist_items_owner_status_order" ON "wishlist_items" USING btree ("owner_id","status","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "wishlist_items_owner_product_active" ON "wishlist_items" USING btree ("owner_id","product_id") WHERE status = 'active' and deleted_at is null;