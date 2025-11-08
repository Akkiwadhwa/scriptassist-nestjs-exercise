import { ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorage,
  getOptionsToken,
  getStorageToken,
} from '@nestjs/throttler';
import { Request } from 'express';
import { createHash } from 'crypto';

@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  constructor(
    @Inject(getOptionsToken()) options: ThrottlerModuleOptions,
    @Inject(getStorageToken()) storageService: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(options, storageService, reflector);
  }

  protected generateKey(context: ExecutionContext, suffix: string, name: string): string {
    const request = context.switchToHttp().getRequest<Request>();
    const source = request.ip || (request.headers['x-forwarded-for'] as string) || 'unknown';
    const userId = (request.user as { id?: string } | undefined)?.id ?? 'anonymous';
    const identifier = `${name}:${suffix}:${source}:${userId}`;
    return createHash('sha256').update(identifier).digest('hex');
  }

  protected async throwThrottlingException(
    _context: ExecutionContext,
    _detail: any,
  ) {
    throw new HttpException(
      'Too many requests. Please slow down before retrying.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
