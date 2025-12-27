-- 002-init-sg01-schema.sql
-- TENANT SCHEMA: SG01 (Shine & Go Cleaning)

CREATE SCHEMA IF NOT EXISTS sg01;

CREATE TABLE IF NOT EXISTS sg01.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform VARCHAR(50) NOT NULL,
  platform_thread_id VARCHAR(255) UNIQUE NOT NULL,
  user_identifier VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  assigned_brain VARCHAR(100),
  last_admin_interaction TIMESTAMPTZ,
  last_activity TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sg01.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES sg01.conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  intent_classification VARCHAR(100),
  metadata JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sg01.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES sg01.conversations(id),
  contact_name VARCHAR(255),
  phone VARCHAR(50),
  email VARCHAR(255),
  service_requested VARCHAR(100),
  quote_amount DECIMAL(10,2),
  qualification_score INTEGER,
  geo_validated BOOLEAN DEFAULT false,
  hot_lead_flag BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sg01.geo_service_area (
  id SERIAL PRIMARY KEY,
  center_lat DECIMAL(10,7) NOT NULL,
  center_lon DECIMAL(10,7) NOT NULL,
  radius_miles INTEGER NOT NULL,
  active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS sg01.pricing_rules (
  id SERIAL PRIMARY KEY,
  service_type VARCHAR(100) NOT NULL,
  base_price DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS sg01.admin_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES sg01.conversations(id),
  admin_platform_id VARCHAR(255) NOT NULL,
  activated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  reason VARCHAR(255)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_conv_platform_thread_sg01 ON sg01.conversations(platform_thread_id);
CREATE INDEX IF NOT EXISTS idx_conv_status_sg01 ON sg01.conversations(status);
CREATE INDEX IF NOT EXISTS idx_msg_conversation_sg01 ON sg01.messages(conversation_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_leads_hot_sg01 ON sg01.leads(hot_lead_flag) WHERE hot_lead_flag = true;
