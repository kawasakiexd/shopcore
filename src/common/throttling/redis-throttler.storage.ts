import { Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Redis } from 'ioredis';

type StorageRecord = {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
};

const LUA = `
local hitsKey = KEYS[1]
local blockKey = KEYS[2]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDuration = tonumber(ARGV[3])

local blockTtl = redis.call('PTTL', blockKey)
if blockTtl > 0 then
  local hits = tonumber(redis.call('GET', hitsKey) or '0')
  local hitsTtl = redis.call('PTTL', hitsKey)
  return { hits, hitsTtl, 1, blockTtl }
end

local hits = redis.call('INCR', hitsKey)
if hits == 1 then
  redis.call('PEXPIRE', hitsKey, ttl)
end

local hitsTtl = redis.call('PTTL', hitsKey)
local blocked = 0
local blockExpire = 0
if hits > limit then
  redis.call('SET', blockKey, '1', 'PX', blockDuration)
  blocked = 1
  blockExpire = blockDuration
end

return { hits, hitsTtl, blocked, blockExpire }
`;

export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);

  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<StorageRecord> {
    const hitsKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `${hitsKey}:block`;
    try {
      const result = (await this.redis.eval(
        LUA,
        2,
        hitsKey,
        blockKey,
        ttl,
        limit,
        blockDuration,
      )) as number[];
      const totalHits = Number(result[0] ?? 0);
      const timeToExpireMs = Number(result[1] ?? ttl);
      const blocked = Number(result[2] ?? 0) === 1;
      const timeToBlockExpireMs = Number(result[3] ?? 0);
      return {
        totalHits,
        timeToExpire: Math.max(1, Math.ceil(timeToExpireMs / 1000)),
        isBlocked: blocked,
        timeToBlockExpire: Math.max(0, Math.ceil(timeToBlockExpireMs / 1000)),
      };
    } catch (error) {
      this.logger.warn({ err: error }, 'Throttler Redis storage failed open');
      return {
        totalHits: 0,
        timeToExpire: Math.ceil(ttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }
}
