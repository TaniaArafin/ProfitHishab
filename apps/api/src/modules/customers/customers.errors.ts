import { AppError } from '../../common/errors';

export class CustomerError extends AppError {
  static notFound(): CustomerError {
    return new CustomerError(404, 'customer_not_found', 'Customer not found.');
  }

  static phoneTaken(): CustomerError {
    const message = 'A customer with this phone number already exists.';
    return new CustomerError(409, 'customer_phone_taken', message, { phone: [message] });
  }

  static invalidPhone(): CustomerError {
    const message = 'Enter a number like 017XXXXXXXX';
    return new CustomerError(422, 'validation_failed', message, { phone: [message] });
  }
}
