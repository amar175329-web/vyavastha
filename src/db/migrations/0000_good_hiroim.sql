CREATE TABLE `activity_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text NOT NULL,
	`event_type` text NOT NULL,
	`status` text NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_activity_channel` ON `activity_logs` (`channel`);--> statement-breakpoint
CREATE INDEX `idx_activity_event_type` ON `activity_logs` (`event_type`);--> statement-breakpoint
CREATE INDEX `idx_activity_created_at` ON `activity_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `knowledge_items` (
	`id` text PRIMARY KEY NOT NULL,
	`source_url` text,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`raw_content` text,
	`media_type` text NOT NULL,
	`tags` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_knowledge_media_type` ON `knowledge_items` (`media_type`);--> statement-breakpoint
CREATE INDEX `idx_knowledge_created_at` ON `knowledge_items` (`created_at`);--> statement-breakpoint
CREATE TABLE `personal_memory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`provenance_source_id` text,
	`confidence_score` real DEFAULT 1 NOT NULL,
	`confirmed_by_user` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_memory_category` ON `personal_memory_items` (`category`);--> statement-breakpoint
CREATE INDEX `idx_memory_confirmed` ON `personal_memory_items` (`confirmed_by_user`);--> statement-breakpoint
CREATE TABLE `task_items` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`source_knowledge_id` text,
	`due_date` integer,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_status` ON `task_items` (`status`);--> statement-breakpoint
CREATE INDEX `idx_tasks_due_date` ON `task_items` (`due_date`);