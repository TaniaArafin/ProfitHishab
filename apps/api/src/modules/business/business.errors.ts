import { AppError } from '../../common/errors';

export class BusinessError extends AppError {
  static courierNotFound(): BusinessError {
    const message = 'Courier not found.';
    return new BusinessError(404, 'courier_not_found', message, { courierId: [message] });
  }
}
