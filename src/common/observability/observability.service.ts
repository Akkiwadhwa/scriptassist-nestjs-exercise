import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter } from 'events';

export interface TelemetryMetric {
  event: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

@Injectable()
export class ObservabilityService
  extends EventEmitter
  implements OnModuleInit
{
  private readonly logger = new Logger(ObservabilityService.name);

  onModuleInit() {
    this.on('metric', (metric: TelemetryMetric) => {
      this.logger.debug(
        `Metric emitted: ${metric.event}`,
        JSON.stringify(metric.payload),
      );
    });
  }

  record(event: string, payload: Record<string, unknown>) {
    const metric: TelemetryMetric = {
      event,
      payload,
      timestamp: new Date().toISOString(),
    };

    this.emit('metric', metric);
    return metric;
  }
}
