import { CallHandler, ExecutionContext, Injectable, NestInterceptor, PayloadTooLargeException } from '@nestjs/common';
import { catchError, type Observable } from 'rxjs';
import { BusinessError } from './business.errors';

/** Outside `FileInterceptor` on the logo route: multer's size error leaves as `logo_too_large`. */
@Injectable()
export class LogoTooLargeInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((err: unknown) => {
        throw err instanceof PayloadTooLargeException ? BusinessError.logoTooLarge() : err;
      }),
    );
  }
}
