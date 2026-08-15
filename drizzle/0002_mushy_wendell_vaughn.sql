CREATE TABLE `late_reason_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_key` text NOT NULL,
	`order_key` text NOT NULL,
	`order_number` text NOT NULL,
	`dashboard_type` text NOT NULL,
	`entity_name` text DEFAULT '' NOT NULL,
	`order_date` text DEFAULT '' NOT NULL,
	`shipped_date` text DEFAULT '' NOT NULL,
	`processing_days` integer DEFAULT 0 NOT NULL,
	`sla_days` integer,
	`reason` text DEFAULT '' NOT NULL,
	`remarks` text DEFAULT '' NOT NULL,
	`updated_by` text NOT NULL,
	`saved_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `late_reason_history_event_key_unique` ON `late_reason_history` (`event_key`);--> statement-breakpoint
CREATE INDEX `idx_late_reason_history_type_saved` ON `late_reason_history` (`dashboard_type`,`saved_at`);