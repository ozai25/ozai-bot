// src/database/data-source.ts
import 'reflect-metadata';
import * as path from 'path';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

// Load env exactly like main.ts: .env first, then .env.local overrides it.
// In Docker/Railway, process.env is already populated; dotenv is harmless if files don't exist.
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

const toBool = (v: any, fallback = false): boolean => {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes' || s === 'on') return true;
  if (s === 'false' || s === '0' || s === 'no' || s === 'off') return false;
  return fallback;
};

const toInt = (v: any, fallback: number): number => {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
};

const env = process.env;

const host = String(env.DB_HOST ?? env.DATABASE_HOST ?? 'localhost').trim();
const port = toInt(env.DB_PORT ?? env.DATABASE_PORT, 5432);

// ✅ Golden Path names first (DB_USERNAME / DB_DATABASE), then legacy fallbacks.
const username = String(
  env.DB_USERNAME ?? env.DB_USER ?? env.DATABASE_USER ?? 'postgres',
).trim();

const password = String(env.DB_PASSWORD ?? env.DATABASE_PASSWORD ?? '').trim();

const database = String(
  env.DB_DATABASE ?? env.DB_NAME ?? env.DATABASE_NAME ?? 'postgres',
).trim();

const ssl =
  toBool(env.DB_SSL ?? env.DATABASE_SSL, false) ||
  String(env.DATABASE_URL ?? '').trim().length > 0;

// If you explicitly set DATABASE_URL, let TypeORM parse it.
const url = String(env.DATABASE_URL ?? '').trim() || undefined;

// Keep these aligned with AppModule: NOT synchronize in real systems.
const synchronize = toBool(env.TYPEORM_SYNCHRONIZE, false);
const logging = toBool(env.TYPEORM_LOGGING, false);

// IMPORTANT:
// - CLI DS is used for migrations and should not try to load every entity via autoLoadEntities.
// - Entities path here is relative to the compiled output at runtime (dist/src/database/*).
const entities = [path.join(__dirname, 'entities', '**', '*.entity{.ts,.js}')];

// Migration files live under src/database/migrations and compile to dist/src/database/migrations.
const migrations = [path.join(__dirname, 'migrations', '*{.ts,.js}')];

export const AppDataSource = new DataSource({
  type: 'postgres',
  url,
  host: url ? undefined : host,
  port: url ? undefined : port,
  username: url ? undefined : username,
  password: url ? undefined : password,
  database: url ? undefined : database,

  ssl: ssl
    ? {
        rejectUnauthorized: false,
      }
    : false,

  entities,
  migrations,

  synchronize,
  logging,
});

export default AppDataSource;
