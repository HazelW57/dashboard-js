CREATE TABLE `dashboard_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`dashboard_json` text NOT NULL,
	`source_filename` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `late_reasons` (
	`order_key` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`dashboard_type` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`remarks` text DEFAULT '' NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`filename` text NOT NULL,
	`object_key` text NOT NULL,
	`uploaded_by` text NOT NULL,
	`uploaded_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`report_label` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uploads_object_key_unique` ON `uploads` (`object_key`);