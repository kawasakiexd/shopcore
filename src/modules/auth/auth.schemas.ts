import { z } from 'zod';
import { UserProfileSchema } from '../users/users.schemas.js';

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254))
  .meta({ example: 'customer@example.com' });

export const PasswordSchema = z
  .string()
  .min(8)
  .max(128)
  .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), {
    message: 'Password must contain a letter and a digit',
  });

export const RegisterSchema = z
  .strictObject({
    email: EmailSchema,
    password: PasswordSchema.meta({ example: 'DemoCustomer123!' }),
    name: z.string().trim().min(1).max(80).meta({ example: 'Demo Customer' }),
  })
  .superRefine((value, ctx) => {
    if (value.password === value.email) {
      ctx.addIssue({
        code: 'custom',
        path: ['password'],
        message: 'Password must not equal the email',
      });
    }
  });

export type RegisterInput = z.output<typeof RegisterSchema>;

export const LoginSchema = z.strictObject({
  email: EmailSchema,
  password: z.string().min(1).max(128).meta({ example: 'DemoCustomer123!' }),
});

export type LoginInput = z.output<typeof LoginSchema>;

export const RefreshSchema = z.strictObject({
  refreshToken: z.string().min(1).meta({ example: 'base64url-token' }),
});

export type RefreshInput = z.output<typeof RefreshSchema>;

export const LogoutSchema = z.strictObject({
  refreshToken: z.string().min(1),
});

export const TokenPairSchema = z.object({
  tokenType: z.literal('Bearer'),
  accessToken: z.string(),
  accessTokenExpiresAt: z.string(),
  refreshToken: z.string(),
  refreshTokenExpiresAt: z.string(),
});

export const AuthResponseSchema = z.object({
  user: UserProfileSchema,
  tokens: TokenPairSchema,
});

export type TokenPair = z.infer<typeof TokenPairSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
