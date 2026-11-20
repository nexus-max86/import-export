import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/** Valide un corps de requête avec un schéma Zod partagé (packages/shared). */
export class ZodBody<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Certains champs sont invalides.',
        fields: Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message])),
      });
    }
    return result.data;
  }
}
