CREATE TABLE `bank_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`bank_code` text NOT NULL,
	`bank_name` text NOT NULL,
	`connector` text NOT NULL,
	`environment` text DEFAULT 'sandbox' NOT NULL,
	`branch` text,
	`account_reference` text,
	`credential_reference` text,
	`configuration_json` text,
	`status` text DEFAULT 'not_configured' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bank_accounts_org_connector_idx` ON `bank_accounts` (`organization_id`,`connector`);--> statement-breakpoint
CREATE TABLE `bank_charges` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`bank_account_id` text NOT NULL,
	`financial_entry_id` text,
	`provider` text NOT NULL,
	`charge_type` text DEFAULT 'boleto' NOT NULL,
	`external_id` text,
	`nosso_numero` text,
	`txid` text,
	`amount_cents` integer NOT NULL,
	`due_date` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`barcode` text,
	`pix_copy_paste` text,
	`settled_at` text,
	`idempotency_key` text NOT NULL,
	`provider_response_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bank_account_id`) REFERENCES `bank_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`financial_entry_id`) REFERENCES `financial_entries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_charges_org_idempotency_idx` ON `bank_charges` (`organization_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `bank_charges_org_status_idx` ON `bank_charges` (`organization_id`,`status`);--> statement-breakpoint
CREATE TABLE `fiscal_distribution_cursors` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`service` text DEFAULT 'nfe_distribution' NOT NULL,
	`environment` text DEFAULT 'production' NOT NULL,
	`last_nsu` text DEFAULT '000000000000000' NOT NULL,
	`max_nsu` text,
	`last_status_code` text,
	`last_query_at` text,
	`next_query_allowed_at` text,
	`status` text DEFAULT 'idle' NOT NULL,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fiscal_distribution_org_service_env_idx` ON `fiscal_distribution_cursors` (`organization_id`,`service`,`environment`);--> statement-breakpoint
CREATE TABLE `organization_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`deployment_mode` text DEFAULT 'saas' NOT NULL,
	`plan_code` text DEFAULT 'seven_internal' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`seats` integer DEFAULT 1 NOT NULL,
	`billing_cycle` text DEFAULT 'monthly' NOT NULL,
	`billing_customer_reference` text,
	`trial_ends_at` text,
	`next_billing_date` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_org_idx` ON `organization_subscriptions` (`organization_id`);--> statement-breakpoint
CREATE TABLE `received_fiscal_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`source` text DEFAULT 'dfe_distribution' NOT NULL,
	`model` text NOT NULL,
	`nsu` text,
	`access_key` text NOT NULL,
	`issuer_tax_id` text,
	`issuer_name` text NOT NULL,
	`recipient_tax_id` text,
	`issue_date` text,
	`received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`total_cents` integer DEFAULT 0 NOT NULL,
	`document_status` text DEFAULT 'authorized' NOT NULL,
	`manifestation_status` text DEFAULT 'not_manifested' NOT NULL,
	`latest_event_code` text,
	`xml_object_key` text,
	`distribution_response_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `received_fiscal_org_key_idx` ON `received_fiscal_documents` (`organization_id`,`access_key`);--> statement-breakpoint
CREATE INDEX `received_fiscal_org_model_issue_idx` ON `received_fiscal_documents` (`organization_id`,`model`,`issue_date`);--> statement-breakpoint
CREATE INDEX `received_fiscal_org_manifest_idx` ON `received_fiscal_documents` (`organization_id`,`manifestation_status`);--> statement-breakpoint
CREATE TABLE `recipient_manifestations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`received_document_id` text NOT NULL,
	`event_type` text NOT NULL,
	`event_code` text NOT NULL,
	`sequence` integer DEFAULT 1 NOT NULL,
	`justification` text,
	`environment` text DEFAULT 'homologation' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`protocol` text,
	`registered_at` text,
	`response_json` text,
	`idempotency_key` text NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`received_document_id`) REFERENCES `received_fiscal_documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipient_manifest_org_idempotency_idx` ON `recipient_manifestations` (`organization_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `recipient_manifest_document_idx` ON `recipient_manifestations` (`received_document_id`);--> statement-breakpoint
CREATE INDEX `recipient_manifest_org_status_idx` ON `recipient_manifestations` (`organization_id`,`status`);