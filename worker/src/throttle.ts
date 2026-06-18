import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const GLOBAL_KEY = "throttle:app:global";
const AMBASSADOR_PREFIX = "throttle:ambassador:";
const GLOBAL_LIMIT = Number(process.env.APP_CONCURRENCY_CAP ?? 20);
const AMBASSADOR_LIMIT = Number(process.env.AMBASSADOR_CONCURRENCY_CAP ?? 1);

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  }
  return redis;
}

async function evalAcquire(key: string, limit: number, ttlSec: number): Promise<boolean> {
  const client = getRedis();
  const current = await client.incr(key);
  if (current === 1) {
    await client.expire(key, ttlSec);
  }
  if (current > limit) {
    await client.decr(key);
    return false;
  }
  return true;
}

async function evalRelease(key: string): Promise<void> {
  const client = getRedis();
  const val = await client.decr(key);
  if (val <= 0) {
    await client.del(key);
  }
}

export async function acquireGlobalSlot(): Promise<boolean> {
  return evalAcquire(GLOBAL_KEY, GLOBAL_LIMIT, 60);
}

export async function releaseGlobalSlot(): Promise<void> {
  return evalRelease(GLOBAL_KEY);
}

export async function acquireAmbassadorSlot(profileId: string): Promise<boolean> {
  return evalAcquire(`${AMBASSADOR_PREFIX}${profileId}`, AMBASSADOR_LIMIT, 120);
}

export async function releaseAmbassadorSlot(profileId: string): Promise<void> {
  return evalRelease(`${AMBASSADOR_PREFIX}${profileId}`);
}
