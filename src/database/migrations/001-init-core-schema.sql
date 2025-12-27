-- 001-init-core-schema.sql
-- Core schema for global config and audit logs

-- UUID generator (needed for gen_random_uuid())
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CORE SCHEMA: Global Configuration
CREATE SCHEMA IF NOT EXISTS core;

CREATE TABLE IF NOT EXISTS core.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  schema_name VARCHAR(50) NOT NULL,
  api_keys JSONB,
  config JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES core.tenants(id),
  event_type VARCHAR(100) NOT NULL,
  actor VARCHAR(255),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant ON core.audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON core.audit_logs(created_at);
