CREATE TABLE `jobs` (
	`job_id` text PRIMARY KEY NOT NULL,
	`schema_version` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`input_media_path` text NOT NULL,
	`input_language` text,
	`result_output_path` text,
	`result_completed_at` text,
	`error_message` text,
	`error_occurred_at` text,
	CONSTRAINT "status_valid" CHECK("jobs"."status" IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED')),
	CONSTRAINT "result_matches_status" CHECK((
        ("jobs"."status" = 'COMPLETED'
          AND "jobs"."result_output_path" IS NOT NULL
          AND "jobs"."result_completed_at" IS NOT NULL)
        OR
        ("jobs"."status" != 'COMPLETED'
          AND "jobs"."result_output_path" IS NULL
          AND "jobs"."result_completed_at" IS NULL)
      )),
	CONSTRAINT "error_matches_status" CHECK((
        ("jobs"."status" = 'FAILED'
          AND "jobs"."error_message" IS NOT NULL
          AND "jobs"."error_occurred_at" IS NOT NULL)
        OR
        ("jobs"."status" != 'FAILED'
          AND "jobs"."error_message" IS NULL
          AND "jobs"."error_occurred_at" IS NULL)
      ))
);
--> statement-breakpoint
CREATE INDEX `idx_jobs_status` ON `jobs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_jobs_created_at` ON `jobs` (`created_at`);