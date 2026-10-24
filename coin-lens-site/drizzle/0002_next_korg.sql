CREATE TABLE `radar_ownership_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`pair` text NOT NULL,
	`at` integer NOT NULL,
	`state` text NOT NULL,
	`config` text NOT NULL,
	`evidence` text NOT NULL,
	`report` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ownership_address_at` ON `radar_ownership_reports` (`address`,`at`);