CREATE TABLE `radar_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`status` text NOT NULL,
	`details` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `radar_leases` (
	`name` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `radar_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`pair` text NOT NULL,
	`address` text NOT NULL,
	`at` integer NOT NULL,
	`price` real,
	`liquidity` real,
	`status` text NOT NULL,
	`source` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `obs_pair_at` ON `radar_observations` (`pair`,`at`);--> statement-breakpoint
CREATE TABLE `radar_outcomes` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshot_id` text NOT NULL,
	`horizon` integer NOT NULL,
	`due_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`observed_at` integer,
	`result` text,
	FOREIGN KEY (`snapshot_id`) REFERENCES `radar_snapshots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outcome_snapshot_horizon` ON `radar_outcomes` (`snapshot_id`,`horizon`);--> statement-breakpoint
CREATE INDEX `outcomes_due` ON `radar_outcomes` (`status`,`due_at`);--> statement-breakpoint
CREATE TABLE `radar_scans` (
	`id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`actor` text NOT NULL,
	`source` text NOT NULL,
	`config` text NOT NULL,
	`warnings` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scans_actor_at` ON `radar_scans` (`actor`,`at`);--> statement-breakpoint
CREATE TABLE `radar_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`scan_id` text NOT NULL,
	`address` text NOT NULL,
	`pair` text NOT NULL,
	`at` integer NOT NULL,
	`price` real,
	`liquidity` real,
	`features` text NOT NULL,
	`old_gate` integer NOT NULL,
	`config` text NOT NULL,
	FOREIGN KEY (`scan_id`) REFERENCES `radar_scans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snap_scan_token` ON `radar_snapshots` (`scan_id`,`address`);--> statement-breakpoint
CREATE INDEX `snap_pair_at` ON `radar_snapshots` (`pair`,`at`);