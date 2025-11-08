import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { randomUUID } from 'crypto';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const correlationId =
      (request.headers['x-correlation-id'] as string) || randomUUID();

    request.headers['x-correlation-id'] = correlationId;
    response?.setHeader?.('x-correlation-id', correlationId);

    const now = Date.now();
    this.logger.log(
      `Request ${request.method} ${request.url}`,
      correlationId,
    );

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - now;
          this.logger.log(
            `Response ${request.method} ${request.url} - ${response.statusCode} (${duration}ms)`,
            correlationId,
          );
        },
        error: (error) => {
          const duration = Date.now() - now;
          this.logger.error(
            `Error ${request.method} ${request.url} (${duration}ms)`,
            error?.stack || error,
            correlationId,
          );
        },
      }),
    );
  }
}
