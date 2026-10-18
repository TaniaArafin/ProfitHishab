import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType, ZodTypeDef } from 'zod';

/** Validates a body or query with a shared Zod schema. Failures reach the exception filter as ZodError. */
@Injectable()
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T, ZodTypeDef, unknown>) {}

  transform(value: unknown): T {
    return this.schema.parse(value ?? {});
  }
}

export const zod = <T>(schema: ZodType<T, ZodTypeDef, unknown>) => new ZodPipe<T>(schema);
