CREATE TABLE `radar_feed_health` (
	`id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`details` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `radar_launches` (
	`id` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`kind` text NOT NULL,
	`first_seen` integer NOT NULL,
	`received_at` integer NOT NULL,
	`name` text,
	`symbol` text,
	`creator` text,
	`signature` text,
	`source` text NOT NULL,
	`checked_at` integer,
	`indexed_at` integer
);
--> statement-breakpoint
CREATE INDEX `launch_seen` ON `radar_launches` (`first_seen`);--> statement-breakpoint
CREATE INDEX `launch_address` ON `radar_launches` (`address`);