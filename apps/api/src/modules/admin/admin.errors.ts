import { AppError } from '../../common/errors';

export class AdminError extends AppError {
  /** Also what a non-admin gets for every /admin route: the panel's existence is not revealed. */
  static notFound(): AdminError {
    return new AdminError(404, 'not_found', 'Not found.');
  }

  static businessNotFound(): AdminError {
    return new AdminError(404, 'business_not_found', 'Business not found.');
  }

  static cannotBlockOwnBusiness(): AdminError {
    return new AdminError(422, 'cannot_block_own_business', "You can't block your own business: you would lock yourself out.");
  }
}
