import axios from 'axios';
import * as dotenv from 'dotenv';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

// Load env vars (local overrides first)
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

// ✅ ADD: force .env.local to override values already set by .env
dotenv.config({ path: '.env.local', override: true });

const BASE_URL = process.env.WAR_GAMES_BASE_URL || 'http://localhost:3000';
const ADMIN_KEY = String(process.env.ADMIN_API_KEY || process.env.ADMIN_KEY || '').trim();

const TOTAL_ATTACKS = Number(process.env.WAR_GAMES_TOTAL_ATTACKS || 50);
const CONCURRENCY = Number(process.env.WAR_GAMES_CONCURRENCY || 10);
const FIRE_DELAY_MS = Number(process.env.WAR_GAMES_FIRE_DELAY_MS || 25);
const POLL_COUNT = Number(process.env.WAR_GAMES_POLL_COUNT || 6);
const POLL_INTERVAL_MS = Number(process.env.WAR_GAMES_POLL_INTERVAL_MS || 2000);

// Redis settings (matches your config style)
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);
const REDIS_DB = Number(process.env.REDIS_DB || 0);

// Queue names (must match QueuesModule)
const INBOUND_QUEUE_NAME = 'process-message';
const OUTBOUND_QUEUE_NAME = 'send-message';

// Synthetic scenarios
const SCENARIOS = [
  { text: 'Hola, quiero información sobre precios.', platform: 'whatsapp' },
  { text: 'I need a quote for a 3 bedroom house cleaning.', platform: 'facebook' },
  { text: 'Do you work on Sundays?', platform: 'instagram' },
  { text: 'URGENT: My pipes are leaking!', platform: 'whatsapp' },
  { text: 'Just looking around thanks.', platform: 'facebook' },
];

// Simple promise pool for concurrency control
async function promisePool<T>(
  items: T[],
  worker: (item: T, idx: number) => Promise<void>,
  concurrency: number,
) {
  let i = 0;
  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

async function getDashboardSnapshot() {
  const res = await axios.get(`${BASE_URL}/admin/dashboard/snapshot`, {
    headers: { 'x-admin-key': ADMIN_KEY },
    timeout: 10_000,
  });
  const d = res.data;

  const inboundWaiting = d?.queues?.inbound?.waiting ?? 0;
  const inboundActive = d?.queues?.inbound?.active ?? 0;
  const inboundFailed = d?.queues?.inbound?.failed ?? 0;

  const outboundWaiting = d?.queues?.outbound?.waiting ?? 0;
  const outboundActive = d?.queues?.outbound?.active ?? 0;
  const outboundFailed = d?.queues?.outbound?.failed ?? 0;

  const redisMem = d?.infrastructure?.redis_memory ?? 'Unknown';

  return {
    inbound: { waiting: inboundWaiting, active: inboundActive, failed: inboundFailed },
    outbound: { waiting: outboundWaiting, active: outboundActive, failed: outboundFailed },
    redisMem,
  };
}

async function printDashboardSnapshot(tag: string) {
  try {
    const s = await getDashboardSnapshot();
    console.log(`/// DASHBOARD TELEMETRY [${tag}] ///`);
    console.log(
      `[QUEUES] inbound(w:${s.inbound.waiting} a:${s.inbound.active} f:${s.inbound.failed}) | outbound(w:${s.outbound.waiting} a:${s.outbound.active} f:${s.outbound.failed})`,
    );
    console.log(`[REDIS] memory: ${s.redisMem}`);
    console.log('---------------------------');
  } catch (err: any) {
    console.error('!! FAILED TO READ DASHBOARD !!', err?.message || err);
  }
}

/**
 * Attempt #1 (Preferred): hit a real HTTP enqueue endpoint if you have one.
 * This must enqueue into INBOUND queue. If it 404/401/403, we fall back to direct queue enqueue.
 *
 * If you later add an official test ingress endpoint, set:
 *   WAR_GAMES_INGRESS_PATH=/test/inject-inbound
 */
const INGRESS_PATH = String(process.env.WAR_GAMES_INGRESS_PATH || '').trim();

async function tryHttpIngress(
  text: string,
  tenantSlug: string,
  platform: string,
  senderId: string,
) {
  if (!INGRESS_PATH) return { ok: false, reason: 'no_ingress_path' as const };

  try {
    await axios.post(
      `${BASE_URL}${INGRESS_PATH}`,
      { tenantSlug, platform, senderId, text },
      {
        headers: { 'x-admin-key': ADMIN_KEY },
        timeout: 10_000,
      },
    );
    return { ok: true as const };
  } catch (err: any) {
    const status = err?.response?.status;
    return { ok: false as const, reason: `http_${status || 'error'}` as const };
  }
}

/**
 * Guaranteed queue pressure path: enqueue directly into BullMQ using Redis.
 * This will move your dashboard needles even if webhook signature verification blocks external HTTP.
 */
function buildSyntheticInboundJob(i: number) {
  const scenario = SCENARIOS[i % SCENARIOS.length];
  const tenantSlug = String(process.env.WAR_GAMES_TENANT || 'sg01').trim();

  return {
    name: 'process-message',
    data: {
      tenantSlug,
      platform: scenario.platform,
      senderId: `user_${i}`,
      text: scenario.text,
      metadata: { scenario: i, injectedBy: 'war-games' },
    },
  };
}

async function directQueueEnqueue(redis: Redis) {
  const inboundQueue = new Queue(INBOUND_QUEUE_NAME, { connection: redis });
  const outboundQueue = new Queue(OUTBOUND_QUEUE_NAME, { connection: redis });

  return {
    inboundQueue,
    outboundQueue,
    close: async () => {
      await Promise.allSettled([inboundQueue.close(), outboundQueue.close()]);
    },
  };
}

/**
 * Rate limit assault:
 * Configure via WAR_GAMES_RATE_LIMIT_PATH and WAR_GAMES_RATE_LIMIT_BURST.
 */
const RATE_LIMIT_PATH = String(
  process.env.WAR_GAMES_RATE_LIMIT_PATH || '/health/liveness',
).trim();
const RATE_LIMIT_BURST = Number(process.env.WAR_GAMES_RATE_LIMIT_BURST || 150);

/**
 * Order: Always send admin header for admin routes only.
 *
 * Optional override:
 *   WAR_GAMES_RATE_LIMIT_SEND_ADMIN_HEADER=true  => always send
 *   WAR_GAMES_RATE_LIMIT_SEND_ADMIN_HEADER=false => never send
 *   (unset)                                      => send only for /admin/*
 */
const RATE_LIMIT_SEND_ADMIN_HEADER_MODE = String(
  process.env.WAR_GAMES_RATE_LIMIT_SEND_ADMIN_HEADER || '',
)
  .trim()
  .toLowerCase();

function shouldSendAdminHeaderForRateLimitTarget(targetPath: string): boolean {
  if (RATE_LIMIT_SEND_ADMIN_HEADER_MODE === 'true' || RATE_LIMIT_SEND_ADMIN_HEADER_MODE === '1') return true;
  if (RATE_LIMIT_SEND_ADMIN_HEADER_MODE === 'false' || RATE_LIMIT_SEND_ADMIN_HEADER_MODE === '0') return false;

  const p = String(targetPath || '').trim();
  return p === '/admin' || p.startsWith('/admin/');
}

async function rateLimitAssault() {
  console.log(`\n/// RATE LIMIT ASSAULT /// target=${RATE_LIMIT_PATH} burst=${RATE_LIMIT_BURST}\n`);

  let ok = 0;
  let blocked = 0;
  let other = 0;

  const attacks = Array.from({ length: RATE_LIMIT_BURST }, (_, i) => i);

  const sendAdminHeader = shouldSendAdminHeaderForRateLimitTarget(RATE_LIMIT_PATH);
  const headers = sendAdminHeader ? { 'x-admin-key': ADMIN_KEY } : undefined;

  await promisePool(
    attacks,
    async () => {
      try {
        const res = await axios.get(`${BASE_URL}${RATE_LIMIT_PATH}`, { timeout: 10_000, headers });
        if (res.status === 200) ok++;
        else other++;
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 429) blocked++;
        else other++;
      }
    },
    Math.min(50, CONCURRENCY * 5),
  );

  console.log(`[RATE LIMIT] ok=${ok} blocked(429)=${blocked} other=${other}`);
  console.log('---------------------------');
}

async function runWarGames() {
  if (!ADMIN_KEY) {
    console.error('FATAL: ADMIN_API_KEY / ADMIN_KEY is not set in env. Dashboard reads will fail.');
    process.exit(1);
  }

  console.log(`\n/// OPERATION WAR GAMES: INITIATING ${TOTAL_ATTACKS} STRIKES ///`);
  console.log(`BASE_URL=${BASE_URL}`);
  console.log(`CONCURRENCY=${CONCURRENCY} FIRE_DELAY_MS=${FIRE_DELAY_MS}`);
  console.log(`REDIS=${REDIS_HOST}:${REDIS_PORT} db=${REDIS_DB}`);
  console.log('---------------------------\n');

  await printDashboardSnapshot('PRE');

  const redis = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    db: REDIS_DB,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  const { inboundQueue, close } = await directQueueEnqueue(redis);

  const volley = Array.from({ length: TOTAL_ATTACKS }, (_, i) => i);

  let httpIngressEnabled = Boolean(INGRESS_PATH);
  if (httpIngressEnabled) console.log(`HTTP ingress enabled: ${INGRESS_PATH}`);
  else console.log('HTTP ingress disabled (no WAR_GAMES_INGRESS_PATH). Using direct queue enqueue.');

  console.log('\nFIRING...\n');

  await promisePool(
    volley,
    async (i) => {
      const scenario = SCENARIOS[i % SCENARIOS.length];
      const tenantSlug = String(process.env.WAR_GAMES_TENANT || 'sg01').trim();
      const senderId = `user_${i}`;

      if (httpIngressEnabled) {
        const r = await tryHttpIngress(scenario.text, tenantSlug, scenario.platform, senderId);
        if (!r.ok) {
          httpIngressEnabled = false;
          process.stdout.write('H'); // HTTP ingress failed
        } else {
          process.stdout.write('.');
        }
      }

      if (!httpIngressEnabled) {
        const job = buildSyntheticInboundJob(i);
        await inboundQueue.add(job.name, job.data, {
          attempts: 1,
          removeOnComplete: { age: 3600, count: 2000 },
          removeOnFail: { age: 86400, count: 5000 },
        });
        process.stdout.write('.');
      }

      if (FIRE_DELAY_MS > 0) await new Promise((r) => setTimeout(r, FIRE_DELAY_MS));
    },
    CONCURRENCY,
  );

  console.log('\n\n/// BARRAGE COMPLETE ///\n');

  await printDashboardSnapshot('POST-FIRE');

  for (let j = 0; j < POLL_COUNT; j++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    await printDashboardSnapshot(`DRAIN-${j + 1}/${POLL_COUNT}`);
  }

  await rateLimitAssault();

  await close();
  await redis.quit();

  console.log('\n/// WAR GAMES COMPLETE ///\n');
}

runWarGames().catch((err) => {
  console.error('FATAL WAR GAMES ERROR:', err);
  process.exit(1);
});
