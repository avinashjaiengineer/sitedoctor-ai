import { Redis } from "@upstash/redis";
import type { Report } from "./types";

const REPORT_TTL_SECONDS = 60 * 60 * 6;

const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

// Fallback for local dev or deployments without Redis. Per-instance only.
const memory = new Map<string, { value: unknown; expires: number }>();

function memGet<T>(key: string): T | null {
  const hit = memory.get(key);
  if (!hit || hit.expires < Date.now()) {
    memory.delete(key);
    return null;
  }
  return hit.value as T;
}

export async function getReport(key: string): Promise<Report | null> {
  try {
    return redis ? await redis.get<Report>(`report:v1:${key}`) : memGet<Report>(key);
  } catch {
    return null;
  }
}

export async function saveReport(key: string, report: Report): Promise<void> {
  try {
    if (redis) await redis.set(`report:v1:${key}`, report, { ex: REPORT_TTL_SECONDS });
    else memory.set(key, { value: report, expires: Date.now() + REPORT_TTL_SECONDS * 1000 });
  } catch {
    // Caching is best-effort; the report has already been delivered.
  }
}

/** Fixed-window limiter. Returns true when the caller is within the limit. */
export async function allowRequest(ip: string, limit = 8, windowSeconds = 600): Promise<boolean> {
  const key = `rl:${ip}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
  try {
    if (redis) {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, windowSeconds);
      return count <= limit;
    }
    const count = (memGet<number>(key) ?? 0) + 1;
    memory.set(key, { value: count, expires: Date.now() + windowSeconds * 1000 });
    return count <= limit;
  } catch {
    return true;
  }
}
