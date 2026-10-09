CREATE TABLE `serial_audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_key` text DEFAULT '' NOT NULL,
	`action` text NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`details_json` text DEFAULT '{}' NOT NULL,
	`actor` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_serial_audit_order_created` ON `serial_audit_log` (`order_key`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_serial_audit_created_at` ON `serial_audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `serial_order_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_key` text NOT NULL,
	`sku` text NOT NULL,
	`upc` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`ordered_qty` integer DEFAULT 0 NOT NULL,
	`case_pack` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `serial_order_lines_order_sku_unique` ON `serial_order_lines` (`order_key`,`sku`);--> statement-breakpoint
CREATE INDEX `idx_serial_order_lines_upc` ON `serial_order_lines` (`upc`);--> statement-breakpoint
CREATE TABLE `serial_orders` (
	`order_key` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`po_number` text DEFAULT '' NOT NULL,
	`customer_name` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`order_date` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `serial_orders_order_number_unique` ON `serial_orders` (`order_number`);--> statement-breakpoint
CREATE INDEX `idx_serial_orders_updated_at` ON `serial_orders` (`updated_at`);--> statement-breakpoint
CREATE TABLE `serial_scans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scan_key` text NOT NULL,
	`order_key` text NOT NULL,
	`sku` text NOT NULL,
	`serial_number` text,
	`carton_number` text,
	`scan_type` text DEFAULT 'serial' NOT NULL,
	`unit_quantity` integer DEFAULT 1 NOT NULL,
	`scanned_by` text NOT NULL,
	`scanned_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`voided` integer DEFAULT false NOT NULL,
	`voided_by` text,
	`voided_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `serial_scans_scan_key_unique` ON `serial_scans` (`scan_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `serial_scans_order_serial_unique` ON `serial_scans` (`order_key`,`serial_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `serial_scans_order_carton_unique` ON `serial_scans` (`order_key`,`carton_number`);--> statement-breakpoint
CREATE INDEX `idx_serial_scans_order_sku` ON `serial_scans` (`order_key`,`sku`);--> statement-breakpoint
CREATE INDEX `idx_serial_scans_serial` ON `serial_scans` (`serial_number`);--> statement-breakpoint
CREATE INDEX `idx_serial_scans_carton` ON `serial_scans` (`carton_number`);--> statement-breakpoint
CREATE INDEX `idx_serial_scans_scanned_at` ON `serial_scans` (`scanned_at`);