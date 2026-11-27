DROP INDEX "product_swipes_user_context_at";--> statement-breakpoint
ALTER TABLE "product_swipes" ADD COLUMN "seq" bigserial NOT NULL;--> statement-breakpoint
CREATE INDEX "product_swipes_user_context_seq" ON "product_swipes" USING btree ("user_id","context_key","seq");