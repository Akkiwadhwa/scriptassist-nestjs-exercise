import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async check() {
    try {
      await this.dataSource.query('SELECT 1');
      return { database: 'ok' };
    } catch (error) {
      this.logger.error('Database health check failed', error as Error);
      return { database: 'down', reason: (error as Error).message };
    }
  }
}
