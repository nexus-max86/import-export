import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';

/** Limitation de débit à fenêtre fixe, stockée dans Redis. */
@Injectable()
export class RateLimitService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** Lève 429 si `key` a dépassé `limit` appels dans la fenêtre de `windowSeconds`. */
  async consume(key: string, limit: number, windowSeconds: number): Promise<void> {
    if (this.redis.status === 'wait') await this.redis.connect();
    const redisKey = `rl:${key}`;
    const [[, count]] = (await this.redis
      .multi()
      .incr(redisKey)
      .expire(redisKey, windowSeconds, 'NX')
      .exec()) as [[null, number], [null, number]];
    if (count > limit) {
      throw new HttpException(
        'Trop de tentatives. Réessayez dans quelques minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
