CREATE TABLE `dashboard_snapshots` (
	`snapshot_key` text PRIMARY KEY NOT NULL,
	`report_label` text NOT NULL,
	`dashboard_json` text NOT NULL,
	`source_filename` text NOT NULL,
	`object_key` text DEFAULT '' NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_dashboard_snapshots_updated_at` ON `dashboard_snapshots` (`updated_at`);