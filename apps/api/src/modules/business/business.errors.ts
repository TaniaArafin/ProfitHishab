import { AppError } from '../../common/errors';

export class BusinessError extends AppError {
  static courierNotFound(): BusinessError {
    const message = 'Courier not found.';
    return new BusinessError(404, 'courier_not_found', message, { courierId: [message] });
  }

  static logoUnsupported(): BusinessError {
    const message = 'Use a PNG, JPG or WebP image.';
    return new BusinessError(415, 'logo_unsupported', message, { file: [message] });
  }

  static logoTooLarge(): BusinessError {
    const message = 'The logo must be 2 MB or smaller.';
    return new BusinessError(413, 'logo_too_large', message, { file: [message] });
  }

  static logoNotFound(): BusinessError {
    return new BusinessError(404, 'logo_not_found', 'This business has no logo.');
  }
}
