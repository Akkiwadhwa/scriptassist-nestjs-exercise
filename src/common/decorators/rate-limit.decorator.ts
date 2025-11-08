import { Throttle } from '@nestjs/throttler';

export const RateLimit = (limit: number, windowMs: number) => {
  const ttl = Math.max(1, Math.ceil(windowMs / 1000));
  return Throttle({
    default: {
      limit,
      ttl,
    },
  });
};
