import { CallHandler, ExecutionContext, Injectable, NestInterceptor, PayloadTooLargeException } from '@nestjs/common';
import { catchError, type Observable } from 'rxjs';
import { ImportError } from './imports.errors';

/**
 * Placed outside `FileInterceptor` on the upload route: multer's LIMIT_FILE_SIZE arrives as Nest's
 * PayloadTooLargeException and leaves as `ImportError.fileTooLarge()`, so the central filter shapes it
 * like any other AppError.
 */
@Injectable()
export class ImportFileTooLargeInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((err: unknown) => {
        throw err instanceof PayloadTooLargeException ? ImportError.fileTooLarge() : err;
      }),
    );
  }
}
