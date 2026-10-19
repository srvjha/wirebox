ALTER TABLE "lab_progress" RENAME TO "drill_progress";--> statement-breakpoint
ALTER TABLE "drill_progress" RENAME COLUMN "lab_slug" TO "drill_slug";--> statement-breakpoint
ALTER TABLE "drill_progress" RENAME COLUMN "lab_version" TO "drill_version";--> statement-breakpoint
ALTER TABLE "drill_progress" RENAME CONSTRAINT "lab_progress_user_id_lab_slug_pk" TO "drill_progress_user_id_drill_slug_pk";--> statement-breakpoint
ALTER TABLE "drill_progress" RENAME CONSTRAINT "lab_progress_user_id_user_id_fk" TO "drill_progress_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "load_test_run" RENAME COLUMN "lab_slug" TO "drill_slug";--> statement-breakpoint
ALTER INDEX "load_test_run_lab_idx" RENAME TO "load_test_run_drill_idx";--> statement-breakpoint
ALTER TABLE "postmortem" RENAME COLUMN "lab_slug" TO "drill_slug";
