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
UPDATE public.users SET is_profile_complete = true
WHERE name IS NOT NULL AND province IS NOT NULL AND city IS NOT NULL AND date_of_birth IS NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.users(id) VALUES (NEW.id);
  DELETE FROM public.registration_codes WHERE email = lower(trim(NEW.email));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
ALTER TABLE public.registration_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.registration_codes FROM PUBLIC, anon, authenticated;
