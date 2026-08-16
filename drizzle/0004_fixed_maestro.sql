PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`legal_name` text NOT NULL,
	`trade_name` text NOT NULL,
	`tax_id` text,
	`state_registration` text,
	`municipal_registration` text,
	`tax_regime` text,
	`city_code` text,
	`state` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_organizations`("id", "legal_name", "trade_name", "tax_id", "state_registration", "municipal_registration", "tax_regime", "city_code", "state", "status", "created_at", "updated_at") SELECT "id", "legal_name", "trade_name", "tax_id", "state_registration", "municipal_registration", "tax_regime", "city_code", "state", "status", "created_at", "updated_at" FROM `organizations`;--> statement-breakpoint
DROP TABLE `organizations`;--> statement-breakpoint
ALTER TABLE `__new_organizations` RENAME TO `organizations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_tax_id_idx` ON `organizations` (`tax_id`);--> statement-breakpoint
UPDATE `organizations`
SET `tax_id` = NULL,
    `tax_regime` = NULL,
    `city_code` = NULL,
    `state` = NULL,
    `updated_at` = CURRENT_TIMESTAMP
WHERE `id` = 'seven-ti'
  AND (`tax_id` = 'CONFIGURAR-CNPJ' OR `city_code` = '4302105');
