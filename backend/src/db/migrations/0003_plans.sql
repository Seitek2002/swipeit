ALTER TABLE "plan_participants" ADD COLUMN "seq" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "closed_early" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "seq" bigserial NOT NULL;