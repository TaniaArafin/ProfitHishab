import { AppError } from '../../common/errors';

export class BillingError extends AppError {
  /** At most one payment waits for review per business (partial unique index). */
  static paymentPending(): BillingError {
    return new BillingError(409, 'payment_pending', 'You already sent a payment. We will check it soon.');
  }

  /** The (method, transactionId) pair is unique across every business: one TrxID pays once. */
  static transactionUsed(): BillingError {
    const message = 'This transaction ID was already used.';
    return new BillingError(409, 'transaction_used', message, { transactionId: [message] });
  }

  /** No receiving number is configured for this method. */
  static methodUnavailable(): BillingError {
    const message = 'This payment method is not available right now. Choose another one.';
    return new BillingError(422, 'payment_method_unavailable', message, { method: [message] });
  }

  static notFound(): BillingError {
    return new BillingError(404, 'payment_not_found', 'Payment not found.');
  }

  /** Confirm or reject on a payment that is no longer pending (a double click, or another admin got there first). */
  static alreadyReviewed(): BillingError {
    return new BillingError(409, 'payment_already_reviewed', 'This payment was already confirmed or rejected.');
  }
}
