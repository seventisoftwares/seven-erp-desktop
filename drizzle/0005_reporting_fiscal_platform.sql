PRAGMA foreign_keys = ON;

-- O projeto já possui fiscal_documents; esta migration complementa a estrutura sem duplicar a tabela.
CREATE TABLE IF NOT EXISTS document_templates (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0,
  current_version INTEGER NOT NULL DEFAULT 1,
  schema_version INTEGER NOT NULL DEFAULT 1,
  definition_json TEXT NOT NULL,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  archived_at INTEGER,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS document_templates_org_type_idx ON document_templates(organization_id, document_type);
CREATE UNIQUE INDEX IF NOT EXISTS document_templates_org_name_uq ON document_templates(organization_id, document_type, name) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS document_template_versions (
  id TEXT PRIMARY KEY NOT NULL,
  template_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  definition_json TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (template_id) REFERENCES document_templates(id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS document_template_versions_template_version_uq ON document_template_versions(template_id, version);

CREATE TABLE IF NOT EXISTS fiscal_document_items (
  id TEXT PRIMARY KEY NOT NULL,
  fiscal_document_id TEXT NOT NULL,
  line_number INTEGER NOT NULL,
  catalog_item_id TEXT,
  code TEXT,
  description TEXT NOT NULL,
  ncm TEXT,
  cest TEXT,
  cfop TEXT,
  unit TEXT,
  quantity_milli INTEGER NOT NULL DEFAULT 0,
  unit_value_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  tax_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (fiscal_document_id) REFERENCES fiscal_documents(id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS fiscal_document_items_doc_line_uq ON fiscal_document_items(fiscal_document_id, line_number);

CREATE TABLE IF NOT EXISTS fiscal_events (
  id TEXT PRIMARY KEY NOT NULL,
  fiscal_document_id TEXT,
  organization_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_sequence INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,
  environment TEXT NOT NULL,
  access_key TEXT,
  protocol TEXT,
  request_xml_sha256 TEXT,
  response_xml_sha256 TEXT,
  request_xml_file_id TEXT,
  response_xml_file_id TEXT,
  user_id TEXT,
  reason TEXT,
  provider_response TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (fiscal_document_id) REFERENCES fiscal_documents(id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS fiscal_events_doc_idx ON fiscal_events(fiscal_document_id, created_at);
CREATE INDEX IF NOT EXISTS fiscal_events_access_key_idx ON fiscal_events(access_key);

CREATE TABLE IF NOT EXISTS fiscal_xml_files (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  fiscal_document_id TEXT,
  fiscal_event_id TEXT,
  kind TEXT NOT NULL,
  access_key TEXT,
  protocol TEXT,
  sha256 TEXT NOT NULL,
  content_xml TEXT NOT NULL,
  immutable INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (fiscal_document_id) REFERENCES fiscal_documents(id) ON DELETE RESTRICT,
  FOREIGN KEY (fiscal_event_id) REFERENCES fiscal_events(id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS fiscal_xml_files_hash_kind_uq ON fiscal_xml_files(organization_id, sha256, kind);
CREATE INDEX IF NOT EXISTS fiscal_xml_files_access_key_idx ON fiscal_xml_files(access_key);

CREATE TABLE IF NOT EXISTS fiscal_configurations (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  document_model TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'homologation',
  provider TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  configuration_json TEXT NOT NULL DEFAULT '{}',
  revision INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS fiscal_configurations_org_model_uq ON fiscal_configurations(organization_id, document_model);

CREATE TABLE IF NOT EXISTS certificates (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  certificate_type TEXT NOT NULL,
  vault_reference TEXT NOT NULL,
  subject TEXT,
  issuer TEXT,
  serial_number TEXT,
  thumbprint_sha256 TEXT,
  valid_from INTEGER,
  valid_to INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS certificates_org_vault_ref_uq ON certificates(organization_id, vault_reference);
-- Senha/PFX nunca são armazenados aqui. O conteúdo secreto permanece no cofre criptografado do SO.

CREATE TABLE IF NOT EXISTS nfe_configurations (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '55',
  environment TEXT NOT NULL DEFAULT 'homologation',
  series INTEGER NOT NULL DEFAULT 1,
  next_number INTEGER NOT NULL DEFAULT 1,
  certificate_id TEXT,
  contingency_mode TEXT NOT NULL DEFAULT 'normal',
  csc_vault_reference TEXT,
  csc_id TEXT,
  danfe_orientation TEXT NOT NULL DEFAULT 'portrait',
  danfe_copies INTEGER NOT NULL DEFAULT 1,
  printer_name TEXT,
  preview_before_print INTEGER NOT NULL DEFAULT 1,
  auto_print_after_authorization INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (certificate_id) REFERENCES certificates(id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS nfe_configurations_org_model_uq ON nfe_configurations(organization_id, model);

CREATE TABLE IF NOT EXISTS nfse_configurations (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'homologation',
  provider TEXT NOT NULL DEFAULT 'padrao_nacional',
  municipality_code TEXT NOT NULL,
  municipal_registration TEXT,
  certificate_id TEXT,
  base_url TEXT,
  provider_options_json TEXT NOT NULL DEFAULT '{}',
  credential_vault_reference TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (certificate_id) REFERENCES certificates(id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS nfse_configurations_org_municipality_uq ON nfse_configurations(organization_id, municipality_code, provider);
