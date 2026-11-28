CREATE TABLE "errors_daily" (
	"day" date NOT NULL,
	"code" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"internal" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "errors_daily_day_code_pk" PRIMARY KEY("day","code")
);
