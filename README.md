# 🦁 PROJECT OZ: AI AUTOMATION CORE

**CLASSIFICATION:** INTERNAL / STRATCOM  
**COMMANDER:** SFC Orozco  
**STATUS:** COMBAT READY (v1.0.0)

## 🎯 MISSION
A high-availability, multi-tenant NestJS backend orchestrating AI conversations across WhatsApp, Facebook, and Instagram. Features dual-LLM intelligence (OpenAI + Claude), Redis-backed circuit breakers, and military-grade rate limiting.

---

## ⚡ QUICK START (LOCAL OPS)

### 1. PREREQUISITES
* Node.js v20+
* Docker Desktop (for local Redis/Postgres)
* Railway CLI (optional)

### 2. IGNITION
```bash
# Install dependencies
npm install

# Wake up infrastructure (Redis + Postgres)
docker-compose up -d

# Inject Secrets
# (Ensure .env.local exists with ADMIN_API_KEY and DB credentials)

# Start Development Server
npm run start:dev
