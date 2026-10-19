import { z } from 'zod';

export const UserProfileSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.enum(['CUSTOMER', 'ADMIN']),
  createdAt: z.string(),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;

export const AdminUserSchema = UserProfileSchema.extend({
  isBlocked: z.boolean(),
  isProtected: z.boolean(),
  ordersCount: z.number().int(),
  updatedAt: z.string(),
});

export type AdminUser = z.infer<typeof AdminUserSchema>;

export const UpdateMeSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
});

export type UpdateMeInput = z.output<typeof UpdateMeSchema>;

export const ChangePasswordSchema = z
  .strictObject({
    currentPassword: z.string().min(1).max(128),
    newPassword: z
      .string()
      .min(8)
      .max(128)
      .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), {
        message: 'Password must contain a letter and a digit',
      }),
  })
  .superRefine((value, ctx) => {
    if (value.currentPassword === value.newPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['newPassword'],
        message: 'New password must be different from the current password',
      });
    }
  });

export type ChangePasswordInput = z.output<typeof ChangePasswordSchema>;

export const AdminUserListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().min(1).max(100).optional(),
  role: z.enum(['CUSTOMER', 'ADMIN']).optional(),
  isBlocked: z.stringbool().optional(),
});

export type AdminUserListQuery = z.output<typeof AdminUserListQuerySchema>;

export const PatchAdminUserSchema = z
  .strictObject({
    role: z.enum(['CUSTOMER', 'ADMIN']).optional(),
    isBlocked: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.role === undefined && value.isBlocked === undefined) {
      ctx.addIssue({ code: 'custom', message: 'At least one of role or isBlocked is required' });
    }
  });

export type PatchAdminUserInput = z.output<typeof PatchAdminUserSchema>;
