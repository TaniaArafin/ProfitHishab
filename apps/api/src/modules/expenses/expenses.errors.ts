import { AppError } from '../../common/errors';

export class ExpenseError extends AppError {
  static notFound(): ExpenseError {
    return new ExpenseError(404, 'expense_not_found', 'Expense not found.');
  }

  static categoryNotFound(): ExpenseError {
    const message = 'Category not found.';
    return new ExpenseError(404, 'expense_category_not_found', message, { categoryId: [message] });
  }

  static builtInKindLocked(): ExpenseError {
    const message = "A built-in category's type can't be changed.";
    return new ExpenseError(422, 'builtin_category_locked', message, { kind: [message] });
  }

  static builtInUndeletable(): ExpenseError {
    return new ExpenseError(422, 'builtin_category_locked', "Built-in categories can't be deleted.");
  }

  static categoryInUse(expenseCount: number): ExpenseError {
    return new ExpenseError(
      422,
      'category_in_use',
      `Move or delete the ${expenseCount} expense${expenseCount === 1 ? '' : 's'} in this category first.`,
    );
  }
}
