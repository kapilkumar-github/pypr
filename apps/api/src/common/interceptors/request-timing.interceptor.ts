import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { tap, Observable } from 'rxjs';

@Injectable()
export class RequestTimingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestTimingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const { method, originalUrl } = request;
    const start = performance.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = (performance.now() - start).toFixed(2);
          this.logger.log(`${method} ${originalUrl} - ${duration}ms`);
        },
        error: () => {
          const duration = (performance.now() - start).toFixed(2);
          this.logger.error(`${method} ${originalUrl} - ${duration}ms`);
        },
      }),
    );
  }
}
