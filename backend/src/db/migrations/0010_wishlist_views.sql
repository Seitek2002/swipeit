CREATE TABLE "wishlist_views" (
	"viewer_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"code" text NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	CONSTRAINT "wishlist_views_viewer_id_owner_id_pk" PRIMARY KEY("viewer_id","owner_id")
);
--> statement-breakpoint
ALTER TABLE "wishlist_views" ADD CONSTRAINT "wishlist_views_viewer_id_users_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_views" ADD CONSTRAINT "wishlist_views_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;