CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`actor_email` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`before_json` text,
	`after_json` text,
	`correlation_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_org_created_idx` ON `audit_logs` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `catalog_items` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`type` text DEFAULT 'product' NOT NULL,
	`sku` text,
	`name` text NOT NULL,
	`description` text,
	`ncm` text,
	`cest` text,
	`service_code` text,
	`unit` text DEFAULT 'UN' NOT NULL,
	`cost_cents` integer DEFAULT 0 NOT NULL,
	`price_cents` integer DEFAULT 0 NOT NULL,
	`stock_quantity_milli` integer DEFAULT 0 NOT NULL,
	`minimum_stock_milli` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_org_sku_idx` ON `catalog_items` (`organization_id`,`sku`);--> statement-breakpoint
CREATE INDEX `catalog_org_type_idx` ON `catalog_items` (`organization_id`,`type`);--> statement-breakpoint
CREATE TABLE `certificate_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`party_id` text NOT NULL,
	`protocol` text,
	`certificate_type` text NOT NULL,
	`validity_months` integer DEFAULT 12 NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`validation_method` text,
	`scheduled_at` text,
	`issued_at` text,
	`expires_at` text,
	`partner_reference` text,
	`sale_cents` integer DEFAULT 0 NOT NULL,
	`commission_cents` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `certificate_orders_org_expiry_idx` ON `certificate_orders` (`organization_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `commercial_document_items` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`catalog_item_id` text,
	`description` text NOT NULL,
	`quantity_milli` integer DEFAULT 1000 NOT NULL,
	`unit_price_cents` integer DEFAULT 0 NOT NULL,
	`discount_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer DEFAULT 0 NOT NULL,
	`tax_snapshot_json` text,
	FOREIGN KEY (`document_id`) REFERENCES `commercial_documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`catalog_item_id`) REFERENCES `catalog_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `commercial_items_document_idx` ON `commercial_document_items` (`document_id`);--> statement-breakpoint
CREATE TABLE `commercial_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`party_id` text,
	`type` text DEFAULT 'quote' NOT NULL,
	`number` integer NOT NULL,
	`series` text DEFAULT '1' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`issued_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`valid_until` text,
	`subtotal_cents` integer DEFAULT 0 NOT NULL,
	`discount_cents` integer DEFAULT 0 NOT NULL,
	`freight_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commercial_org_type_number_idx` ON `commercial_documents` (`organization_id`,`type`,`series`,`number`);--> statement-breakpoint
CREATE INDEX `commercial_party_idx` ON `commercial_documents` (`party_id`);--> statement-breakpoint
CREATE TABLE `financial_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`party_id` text,
	`direction` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text,
	`description` text NOT NULL,
	`installment` integer DEFAULT 1 NOT NULL,
	`installment_count` integer DEFAULT 1 NOT NULL,
	`amount_cents` integer NOT NULL,
	`due_date` text NOT NULL,
	`paid_at` text,
	`status` text DEFAULT 'open' NOT NULL,
	`payment_method` text,
	`bank_reference` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `financial_org_due_idx` ON `financial_entries` (`organization_id`,`due_date`);--> statement-breakpoint
CREATE INDEX `financial_party_idx` ON `financial_entries` (`party_id`);--> statement-breakpoint
CREATE TABLE `fiscal_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`party_id` text,
	`model` text NOT NULL,
	`environment` text DEFAULT 'homologation' NOT NULL,
	`number` integer,
	`series` text,
	`access_key` text,
	`protocol` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`issue_date` text,
	`total_cents` integer DEFAULT 0 NOT NULL,
	`xml_object_key` text,
	`pdf_object_key` text,
	`provider_response_json` text,
	`rejection_code` text,
	`rejection_message` text,
	`idempotency_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fiscal_org_idempotency_idx` ON `fiscal_documents` (`organization_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `fiscal_access_key_idx` ON `fiscal_documents` (`access_key`);--> statement-breakpoint
CREATE INDEX `fiscal_org_model_status_idx` ON `fiscal_documents` (`organization_id`,`model`,`status`);--> statement-breakpoint
CREATE TABLE `integration_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`connector` text NOT NULL,
	`environment` text DEFAULT 'homologation' NOT NULL,
	`status` text DEFAULT 'not_configured' NOT NULL,
	`credential_reference` text,
	`configuration_json` text,
	`last_health_check_at` text,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_org_connector_env_idx` ON `integration_connections` (`organization_id`,`connector`,`environment`);--> statement-breakpoint
CREATE TABLE `organization_members` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'operator' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_org_email_idx` ON `organization_members` (`organization_id`,`email`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`legal_name` text NOT NULL,
	`trade_name` text NOT NULL,
	`tax_id` text NOT NULL,
	`state_registration` text,
	`municipal_registration` text,
	`tax_regime` text DEFAULT 'simples_nacional' NOT NULL,
	`city_code` text,
	`state` text DEFAULT 'RS' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_tax_id_idx` ON `organizations` (`tax_id`);--> statement-breakpoint
CREATE TABLE `parties` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`kind` text DEFAULT 'customer' NOT NULL,
	`person_type` text DEFAULT 'legal' NOT NULL,
	`legal_name` text NOT NULL,
	`trade_name` text,
	`tax_id` text,
	`state_registration` text,
	`municipal_registration` text,
	`email` text,
	`phone` text,
	`postal_code` text,
	`street` text,
	`number` text,
	`district` text,
	`city` text,
	`city_code` text,
	`state` text,
	`notes` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `parties_org_kind_idx` ON `parties` (`organization_id`,`kind`);--> statement-breakpoint
CREATE INDEX `parties_tax_id_idx` ON `parties` (`tax_id`);--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`supplier_id` text,
	`number` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`expected_at` text,
	`total_cents` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_orders_org_number_idx` ON `purchase_orders` (`organization_id`,`number`);--> statement-breakpoint
CREATE TABLE `recurring_contracts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`party_id` text NOT NULL,
	`product_code` text NOT NULL,
	`name` text NOT NULL,
	`billing_cycle` text DEFAULT 'monthly' NOT NULL,
	`amount_cents` integer NOT NULL,
	`seats` integer DEFAULT 1 NOT NULL,
	`next_billing_date` text,
	`license_key_reference` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `contracts_org_status_idx` ON `recurring_contracts` (`organization_id`,`status`);--> statement-breakpoint
CREATE TABLE `service_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`party_id` text NOT NULL,
	`number` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`equipment_type` text,
	`equipment_brand` text,
	`equipment_model` text,
	`serial_number` text,
	`reported_issue` text NOT NULL,
	`diagnosis` text,
	`solution` text,
	`technician_email` text,
	`labor_cents` integer DEFAULT 0 NOT NULL,
	`parts_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer DEFAULT 0 NOT NULL,
	`opened_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`closed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_orders_org_number_idx` ON `service_orders` (`organization_id`,`number`);--> statement-breakpoint
CREATE INDEX `service_orders_party_idx` ON `service_orders` (`party_id`);