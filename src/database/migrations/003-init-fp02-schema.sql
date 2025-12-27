-- 003-init-fp02-schema.sql
-- TENANT SCHEMA: FP02 (Furniture Plus)

CREATE SCHEMA IF NOT EXISTS fp02;

CREATE TABLE IF NOT EXISTS fp02.conversations (
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

CREATE TABLE IF NOT EXISTS fp02.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES fp02.conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  intent_classification VARCHAR(100),
  metadata JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fp02.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES fp02.conversations(id),
  contact_name VARCHAR(255),
  phone VARCHAR(50),
  email VARCHAR(255),
  product_interest VARCHAR(255),
  quote_amount DECIMAL(10,2),
  qualification_score INTEGER,
  hot_lead_flag BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fp02.admin_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES fp02.conversations(id),
  admin_platform_id VARCHAR(255) NOT NULL,
  activated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  reason VARCHAR(255)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_conv_platform_thread_fp02 ON fp02.conversations(platform_thread_id);
CREATE INDEX IF NOT EXISTS idx_conv_status_fp02 ON fp02.conversations(status);
CREATE INDEX IF NOT EXISTS idx_msg_conversation_fp02 ON fp02.messages(conversation_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_leads_hot_fp02 ON fp02.leads(hot_lead_flag) WHERE hot_lead_flag = true;
