import { AppError } from '../../common/errors';

export class ProductError extends AppError {
  static notFound(): ProductError {
    return new ProductError(404, 'product_not_found', 'Product not found.');
  }

  static skuTaken(sku: string): ProductError {
    const message = `SKU ${sku} is already used by another product.`;
    return new ProductError(409, 'sku_taken', message, { sku: [message] });
  }

  /** An archived product can stay on old orders but cannot be added to a new one. */
  static archived(name: string): ProductError {
    const message = `${name} is archived. Restore it before adding it to an order.`;
    return new ProductError(422, 'product_archived', message, { items: [message] });
  }
}

export class CategoryError extends AppError {
  static notFound(): CategoryError {
    const message = 'Category not found.';
    return new CategoryError(404, 'category_not_found', message, { categoryId: [message] });
  }

  static nameTaken(name: string): CategoryError {
    const message = `A category called "${name}" already exists.`;
    return new CategoryError(409, 'category_name_taken', message, { name: [message] });
  }
}
