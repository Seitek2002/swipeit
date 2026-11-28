-- Несколько вишлистов (spec-multi-wishlists §3.3). Всё добавляющее, кроме
-- одной замены уникального индекса желаний: «один товар — одно живое
-- желание» теперь в пределах вишлиста, иначе копия невозможна.
-- Существующие данные: каждому профилю — «Общий» с поводом, сообщением и
-- подсказкой из wishlist_meta, все желания — в нём. Ссылки (share_links) не
-- трогаем: target_id «u_…» сервер читает как «Общий» владельца.
CREATE TABLE "wishlists" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"occasion" jsonb,
	"message" text,
	"dismissed_given_hint_for" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seq" bigserial NOT NULL,
	CONSTRAINT "wishlists_name_length" CHECK (char_length(name) between 1 and 40)
);
--> statement-breakpoint
ALTER TABLE "product_swipes" ADD COLUMN "wishlist_id" text;--> statement-breakpoint
ALTER TABLE "santa_members" ADD COLUMN "wishlist_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "active_wishlist_id" text;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD COLUMN "wishlist_id" text;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD COLUMN "origin_id" text;--> statement-breakpoint
ALTER TABLE "wishlist_views" ADD COLUMN "wishlist_id" text;--> statement-breakpoint
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wishlists_owner_default" ON "wishlists" USING btree ("owner_id") WHERE is_default;--> statement-breakpoint
CREATE UNIQUE INDEX "wishlists_owner_name" ON "wishlists" USING btree ("owner_id",lower("name"));--> statement-breakpoint
CREATE INDEX "wishlists_owner_id" ON "wishlists" USING btree ("owner_id","seq");--> statement-breakpoint
ALTER TABLE "santa_members" ADD CONSTRAINT "santa_members_wishlist_id_wishlists_id_fk" FOREIGN KEY ("wishlist_id") REFERENCES "public"."wishlists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_active_wishlist_id_wishlists_id_fk" FOREIGN KEY ("active_wishlist_id") REFERENCES "public"."wishlists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_wishlist_id_wishlists_id_fk" FOREIGN KEY ("wishlist_id") REFERENCES "public"."wishlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- «Общий» каждому профилю, и без желаний: так проще, чем создавать лениво.
-- Повод, сообщение и скрытая подсказка переезжают из wishlist_meta.
INSERT INTO "wishlists" ("id", "owner_id", "name", "is_default", "occasion", "message", "dismissed_given_hint_for")
SELECT 'wl_' || substr(md5(random()::text || u."id"), 1, 10), u."id", 'Общий', true, m."occasion", m."message", m."dismissed_given_hint_for"
FROM "users" u LEFT JOIN "wishlist_meta" m ON m."owner_id" = u."id";--> statement-breakpoint
-- Все желания — в «Общий» владельца (и подаренные, и удалённые в окне
-- «Отменить»).
UPDATE "wishlist_items" i SET "wishlist_id" = w."id"
FROM "wishlists" w WHERE w."owner_id" = i."owner_id" AND w."is_default";--> statement-breakpoint
-- Замена индекса (подтверждает PM): один вишлист у всех — уникальность та
-- же, что была по владельцу.
DROP INDEX "wishlist_items_owner_product_active";--> statement-breakpoint
CREATE UNIQUE INDEX "wishlist_items_list_product_active" ON "wishlist_items" USING btree ("wishlist_id","product_id") WHERE status = 'active' and deleted_at is null;--> statement-breakpoint
CREATE INDEX "wishlist_items_list_status_order" ON "wishlist_items" USING btree ("wishlist_id","status","sort_order");
