import { Module } from '@nestjs/common';
import { RateLimitGuard } from '../guards/rate-limit.guard';
import { RolesGuard } from '../guards/roles.guard';

@Module({
  providers: [RateLimitGuard, RolesGuard],
  exports: [RateLimitGuard, RolesGuard],
})
export class SecurityModule {}
