import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async ping() {
    const result = await this.healthService.check();
    return {
      status: result.database === 'ok' ? 'healthy' : 'unhealthy',
      details: result,
    };
  }
}
