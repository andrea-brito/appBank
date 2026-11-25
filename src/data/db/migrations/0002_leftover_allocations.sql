CREATE TABLE `leftover_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`month_key` text NOT NULL,
	`kind` text NOT NULL,
	`goal_id` text,
	`amount_cents` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_alloc_month` ON `leftover_allocations` (`month_key`);--> statement-breakpoint
ALTER TABLE `goal_deposits` ADD `allocation_id` text;