import { z } from 'zod';

const boolFromEnv = z.union([z.boolean(), z.stringbool()]).optional().default(false);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    PUBLIC_API_URL: z.url().refine((v) => !v.endsWith('/'), {
      message: 'PUBLIC_API_URL must not have a trailing slash',
    }),
    CORS_ORIGINS: z.string().default(''),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    SWAGGER_ENABLED: z.union([z.boolean(), z.stringbool()]).optional().default(true),
    DATABASE_URL: z.string().min(1),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
    REDIS_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    STORE_CURRENCY: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default('USD'),
    ORDER_PAYMENT_TTL_MINUTES: z.coerce.number().int().min(30).max(1440).default(30),
    STRIPE_SECRET_KEY: z.string().min(1),
    STRIPE_WEBHOOK_SECRET: z.string().min(1),
    STRIPE_SUPPRESS_NOTICES: boolFromEnv,
    R2_ACCOUNT_ID: z.string().min(1),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_BUCKET: z.string().min(1),
    R2_PUBLIC_BASE_URL: z.url().refine((v) => !v.endsWith('/'), {
      message: 'R2_PUBLIC_BASE_URL must not have a trailing slash',
    }),
    UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(5_242_880),
    UPLOAD_DAILY_QUOTA: z.coerce.number().int().positive().default(20),
    THROTTLE_GLOBAL_LIMIT: z.coerce.number().int().positive().default(120),
    RESEND_API_KEY: z.string().default(''),
    EMAIL_FROM: z.string().default(''),
    EMAIL_ALLOWLIST: z.string().default(''),
    DEMO_MODE: boolFromEnv,
  })
  .superRefine((env, ctx) => {
    if (
      !env.STRIPE_SECRET_KEY.startsWith('sk_test_') &&
      !env.STRIPE_SECRET_KEY.startsWith('rk_test_')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['STRIPE_SECRET_KEY'],
        message: 'Live Stripe keys are not allowed; use sk_test_ or rk_test_',
      });
    }
    if (env.RESEND_API_KEY && !env.EMAIL_FROM) {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_FROM'],
        message: 'EMAIL_FROM is required when RESEND_API_KEY is set',
      });
    }
    if (env.NODE_ENV === 'production' && !env.PUBLIC_API_URL.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['PUBLIC_API_URL'],
        message: 'PUBLIC_API_URL must be https:// in production',
      });
    }
  });

export type Env = z.output<typeof envSchema>;
