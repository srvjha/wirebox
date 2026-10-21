-- Auth moves from Better Auth to Supabase Auth. Better Auth accounts don't carry
-- over, so progress rows that belonged to them are removed before user_id becomes
-- a uuid referencing auth.users.
ALTER TABLE "drill_progress" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lesson_progress" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "load_test_run" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "postmortem" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "account" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "session" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "verification" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "account" CASCADE;--> statement-breakpoint
DROP TABLE "session" CASCADE;--> statement-breakpoint
DROP TABLE "user" CASCADE;--> statement-breakpoint
DROP TABLE "verification" CASCADE;--> statement-breakpoint
ALTER TABLE "drill_progress" DROP CONSTRAINT IF EXISTS "drill_progress_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "lesson_progress" DROP CONSTRAINT IF EXISTS "lesson_progress_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "load_test_run" DROP CONSTRAINT IF EXISTS "load_test_run_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "postmortem" DROP CONSTRAINT IF EXISTS "postmortem_user_id_user_id_fk";
--> statement-breakpoint
DELETE FROM "drill_progress" WHERE "user_id" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';--> statement-breakpoint
DELETE FROM "lesson_progress" WHERE "user_id" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';--> statement-breakpoint
DELETE FROM "load_test_run" WHERE "user_id" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';--> statement-breakpoint
DELETE FROM "postmortem" WHERE "user_id" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';--> statement-breakpoint
ALTER TABLE "drill_progress" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "lesson_progress" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "load_test_run" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "postmortem" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "drill_progress" ADD CONSTRAINT "drill_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_test_run" ADD CONSTRAINT "load_test_run_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postmortem" ADD CONSTRAINT "postmortem_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;