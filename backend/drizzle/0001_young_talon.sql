CREATE TABLE "registration_codes" (
	"email" text PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "province" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "city" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "date_of_birth" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "social_medias" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "social_medias" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_profile_complete" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "user_profile_complete" CHECK (NOT "users"."is_profile_complete" OR ("users"."name" IS NOT NULL AND "users"."province" IS NOT NULL AND "users"."city" IS NOT NULL AND "users"."date_of_birth" IS NOT NULL));