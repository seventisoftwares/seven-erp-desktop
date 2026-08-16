CREATE TABLE `device_pairing_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `device_pairing_code_hash_idx` ON `device_pairing_codes` (`code_hash`);--> statement-breakpoint
CREATE INDEX `device_pairing_org_expiry_idx` ON `device_pairing_codes` (`organization_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `sync_change_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`device_id` text,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`payload_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`device_id`) REFERENCES `sync_devices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sync_change_org_cursor_idx` ON `sync_change_log` (`organization_id`,`id`);--> statement-breakpoint
CREATE INDEX `sync_change_entity_idx` ON `sync_change_log` (`organization_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `sync_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`platform` text NOT NULL,
	`installation_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`app_version` text,
	`status` text DEFAULT 'active' NOT NULL,
	`last_seen_at` text,
	`last_sync_cursor` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_devices_token_idx` ON `sync_devices` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `sync_devices_org_installation_idx` ON `sync_devices` (`organization_id`,`installation_id`);--> statement-breakpoint
CREATE INDEX `sync_devices_org_status_idx` ON `sync_devices` (`organization_id`,`status`);--> statement-breakpoint
CREATE TABLE `sync_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`device_id` text,
	`operation_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`action` text NOT NULL,
	`payload_hash` text,
	`status` text DEFAULT 'applied' NOT NULL,
	`result_json` text,
	`processed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`device_id`) REFERENCES `sync_devices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_operations_org_operation_idx` ON `sync_operations` (`organization_id`,`operation_id`);--> statement-breakpoint
CREATE INDEX `sync_operations_device_created_idx` ON `sync_operations` (`device_id`,`created_at`);