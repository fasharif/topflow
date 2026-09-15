import { z } from 'zod';
import { idSchema, optionalText, paginationSchema } from './common';

export const auditLogQuerySchema = paginationSchema.extend({
  entityType: optionalText(60),
  entityId: optionalText(60),
  userId: idSchema.optional(),
  action: optionalText(80),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
