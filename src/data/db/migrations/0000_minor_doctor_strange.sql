CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon` text DEFAULT '💸' NOT NULL,
	`color` text DEFAULT '#6366f1' NOT NULL,
	`kind` text NOT NULL,
	`budget_cents` integer
);
--> statement-breakpoint
CREATE TABLE `goal_deposits` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`occurred_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_deposit_goal` ON `goal_deposits` (`goal_id`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon` text DEFAULT '🎯' NOT NULL,
	`color` text DEFAULT '#6366f1' NOT NULL,
	`target_cents` integer NOT NULL,
	`start_at` integer NOT NULL,
	`end_at` integer,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_goal_active` ON `goals` (`archived_at`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text,
	`amount_cents` integer NOT NULL,
	`kind` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`occurred_at` integer NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`external_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_tx_occurred` ON `transactions` (`occurred_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_tx_source_external` ON `transactions` (`source`,`external_id`);