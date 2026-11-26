import { AppError } from '../../common/errors';

export class ProductError extends AppError {
  static notFound(): ProductError {
    return new ProductError(404, 'product_not_found', 'Product not found.');
  }

  static skuTaken(sku: string): ProductError {
    const message = `SKU ${sku} is already used by another product.`;
    return new ProductError(409, 'sku_taken', message, { sku: [message] });
  }

  /** A variant SKU used by another variant of this product or by another product. `field` is `variants.<i>.sku`. */
  static variantSkuTaken(sku: string, field: string): ProductError {
    const message = `SKU ${sku} is already used.`;
    return new ProductError(409, 'sku_taken', message, { [field]: [message] });
  }

  static variantNotFound(): ProductError {
    return new ProductError(404, 'variant_not_found', 'Variant not found.');
  }

  /**
   * A product with several variants was named without saying which one: an order line by
   * `productId`, or a single price/stock update. `field` names the input to fix.
   */
  static variantRequired(name: string, field: string): ProductError {
    const message = `${name} has several variants. Pick one.`;
    return new ProductError(422, 'variant_required', message, { [field]: [message] });
  }

  /** Receive stock into batches is only for a product with "Track expiry & batches" on. */
  static batchesNotTracked(name: string): ProductError {
    const message = `${name} doesn't track batches. Turn on expiry tracking on the product first.`;
    return new ProductError(422, 'batches_not_tracked', message, { tracksBatches: [message] });
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

export class OptionListError extends AppError {
  static notFound(): OptionListError {
    return new OptionListError(404, 'option_list_not_found', 'Option list not found.');
  }

  static nameTaken(name: string): OptionListError {
    const message = `A list called "${name}" already exists.`;
    return new OptionListError(409, 'option_list_taken', message, { name: [message] });
  }
}
