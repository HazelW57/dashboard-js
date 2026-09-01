ALTER TABLE `late_reason_history` ADD `confirmed_not_late` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `late_reason_history` ADD `js_fault` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `late_reasons` ADD `confirmed_not_late` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `late_reasons` ADD `js_fault` integer DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE `late_reasons` SET `js_fault` = false
WHERE lower(trim(`reason`)) IN ('out of stock', 'pre-order', 'address issue', 'customer request');--> statement-breakpoint
UPDATE `late_reason_history` SET `js_fault` = false
WHERE lower(trim(`reason`)) IN ('out of stock', 'pre-order', 'address issue', 'customer request');
