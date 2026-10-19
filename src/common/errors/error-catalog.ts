export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'BAD_REQUEST',
  'WEBHOOK_SIGNATURE_INVALID',
  'UNAUTHENTICATED',
  'INVALID_ACCESS_TOKEN',
  'INVALID_CREDENTIALS',
  'INVALID_REFRESH_TOKEN',
  'REFRESH_TOKEN_REUSED',
  'FORBIDDEN',
  'ACCOUNT_BLOCKED',
  'DEMO_PROTECTED_RESOURCE',
  'NOT_FOUND',
  'RESOURCE_NOT_FOUND',
  'EMAIL_TAKEN',
  'SLUG_TAKEN',
  'SKU_TAKEN',
  'CATEGORY_NOT_EMPTY',
  'CART_EMPTY',
  'INSUFFICIENT_STOCK',
  'OUT_OF_STOCK',
  'INVALID_STATUS_TRANSITION',
  'ORDER_NOT_PENDING',
  'PAYMENT_IN_PROGRESS',
  'IMAGE_LIMIT_REACHED',
  'DEMO_LIMIT_REACHED',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'PRODUCT_UNAVAILABLE',
  'CART_LIMIT_EXCEEDED',
  'CATEGORY_NOT_FOUND',
  'UPLOAD_NOT_FOUND',
  'UPLOAD_INVALID',
  'INVALID_CURRENT_PASSWORD',
  'CANNOT_MODIFY_SELF',
  'RATE_LIMITED',
  'UPLOAD_QUOTA_EXCEEDED',
  'INTERNAL_ERROR',
  'PAYMENT_PROVIDER_ERROR',
  'STORAGE_ERROR',
  'DEMO_RESET_IN_PROGRESS',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const ERROR_CATALOG: Record<
  ErrorCode,
  { status: number; title: string; description: string }
> = {
  VALIDATION_FAILED: {
    status: 400,
    title: 'Request validation failed',
    description: 'The request body, query or path parameters did not match the expected schema.',
  },
  BAD_REQUEST: {
    status: 400,
    title: 'Bad request (malformed JSON, etc.)',
    description: 'The request could not be parsed or is otherwise malformed.',
  },
  WEBHOOK_SIGNATURE_INVALID: {
    status: 400,
    title: 'Invalid webhook signature',
    description: 'The Stripe-Signature header did not match the raw request body.',
  },
  UNAUTHENTICATED: {
    status: 401,
    title: 'Authentication required',
    description: 'A valid Bearer access token is required for this endpoint.',
  },
  INVALID_ACCESS_TOKEN: {
    status: 401,
    title:
      'Access token is invalid or expired (adds WWW-Authenticate: Bearer error="invalid_token")',
    description: 'The access token is missing, malformed, expired or has an invalid signature.',
  },
  INVALID_CREDENTIALS: {
    status: 401,
    title: 'Invalid email or password',
    description: 'The email and password combination is not valid.',
  },
  INVALID_REFRESH_TOKEN: {
    status: 401,
    title: 'Refresh token is invalid, expired or revoked',
    description: 'Present a valid, unspent refresh token.',
  },
  REFRESH_TOKEN_REUSED: {
    status: 401,
    title: 'Refresh token reuse detected; session revoked',
    description:
      'A previously rotated refresh token was presented. The session family has been revoked.',
  },
  FORBIDDEN: {
    status: 403,
    title: 'Insufficient permissions',
    description: 'The authenticated principal does not have the required role.',
  },
  ACCOUNT_BLOCKED: {
    status: 403,
    title: 'Account is blocked',
    description: 'This account has been blocked and cannot sign in or refresh tokens.',
  },
  DEMO_PROTECTED_RESOURCE: {
    status: 403,
    title: 'This demo resource is read-only',
    description: 'Seeded demo accounts cannot have their password, role or blocked flag changed.',
  },
  NOT_FOUND: {
    status: 404,
    title: 'Route not found',
    description: 'No route matches the request path.',
  },
  RESOURCE_NOT_FOUND: {
    status: 404,
    title: 'Resource not found',
    description: 'The requested resource does not exist or is not visible to the caller.',
  },
  EMAIL_TAKEN: {
    status: 409,
    title: 'Email is already registered',
    description: 'An account with this email already exists.',
  },
  SLUG_TAKEN: {
    status: 409,
    title: 'Slug is already in use',
    description: 'Another category or product already uses this slug.',
  },
  SKU_TAKEN: {
    status: 409,
    title: 'SKU is already in use',
    description: 'Another product already uses this SKU.',
  },
  CATEGORY_NOT_EMPTY: {
    status: 409,
    title: 'Category still has products',
    description: 'Archive or move all non-archived products before deleting the category.',
  },
  CART_EMPTY: {
    status: 409,
    title: 'Cart is empty',
    description: 'Add at least one item before creating an order.',
  },
  INSUFFICIENT_STOCK: {
    status: 409,
    title: 'Requested quantity exceeds available stock',
    description: 'Reduce the quantity or pick a different product.',
  },
  OUT_OF_STOCK: {
    status: 409,
    title: 'Some items are out of stock',
    description: 'One or more cart lines cannot be reserved at the requested quantity.',
  },
  INVALID_STATUS_TRANSITION: {
    status: 409,
    title: 'Order status transition is not allowed',
    description: 'The order cannot move from its current status to the requested status.',
  },
  ORDER_NOT_PENDING: {
    status: 409,
    title: 'Order is not awaiting payment',
    description: 'Checkout is only available for pending orders.',
  },
  PAYMENT_IN_PROGRESS: {
    status: 409,
    title: 'Payment is already being completed',
    description: 'A Stripe Checkout session for this order has already been paid.',
  },
  IMAGE_LIMIT_REACHED: {
    status: 409,
    title: 'Product image limit reached',
    description: 'A product may have at most 8 images.',
  },
  DEMO_LIMIT_REACHED: {
    status: 409,
    title: 'Demo capacity limit reached',
    description:
      'The public demo cap for this resource has been reached. Try again after the nightly reset.',
  },
  CONFLICT: {
    status: 409,
    title: 'Resource conflict (generic unique violation)',
    description: 'The write conflicted with an existing unique value.',
  },
  PAYLOAD_TOO_LARGE: {
    status: 413,
    title: 'Request body too large',
    description: 'JSON bodies are limited to 100 KB.',
  },
  UNSUPPORTED_MEDIA_TYPE: {
    status: 415,
    title: 'Unsupported content type',
    description: 'Send application/json unless the endpoint documents another type.',
  },
  PRODUCT_UNAVAILABLE: {
    status: 422,
    title: 'Product is not available for purchase',
    description: 'The product is not ACTIVE or cannot be added to a cart or order.',
  },
  CART_LIMIT_EXCEEDED: {
    status: 422,
    title: 'Cart item limit exceeded',
    description: 'A cart may contain at most 20 distinct products.',
  },
  CATEGORY_NOT_FOUND: {
    status: 422,
    title: 'Referenced category does not exist',
    description: 'The categoryId does not match an existing category.',
  },
  UPLOAD_NOT_FOUND: {
    status: 422,
    title: 'Uploaded object not found',
    description: 'No object exists at the given R2 key.',
  },
  UPLOAD_INVALID: {
    status: 422,
    title: 'Uploaded object is invalid',
    description: 'The object has the wrong prefix, type, size or magic bytes.',
  },
  INVALID_CURRENT_PASSWORD: {
    status: 422,
    title: 'Current password is incorrect',
    description: 'The currentPassword field did not match the stored hash.',
  },
  CANNOT_MODIFY_SELF: {
    status: 422,
    title: 'Admins cannot change their own role or block themselves',
    description: 'Ask another admin to change your role or blocked flag.',
  },
  RATE_LIMITED: {
    status: 429,
    title: 'Too many requests',
    description: 'Slow down. The Retry-After header indicates when to retry.',
  },
  UPLOAD_QUOTA_EXCEEDED: {
    status: 429,
    title: 'Daily upload quota exceeded',
    description: 'This IP has requested too many upload URLs today.',
  },
  INTERNAL_ERROR: {
    status: 500,
    title: 'Internal server error (no details in production)',
    description: 'An unexpected error occurred.',
  },
  PAYMENT_PROVIDER_ERROR: {
    status: 502,
    title: 'Payment provider error',
    description: 'Stripe rejected or failed the request.',
  },
  STORAGE_ERROR: {
    status: 502,
    title: 'Storage provider error',
    description: 'Cloudflare R2 rejected or failed the request.',
  },
  DEMO_RESET_IN_PROGRESS: {
    status: 503,
    title: 'Demo data is being reset',
    description: 'The nightly demo reset is running. Retry after the Retry-After header.',
  },
};

export function errorCodeToSlug(code: ErrorCode): string {
  return code.toLowerCase().replace(/_/g, '-');
}

export function slugToErrorCode(slug: string): ErrorCode | undefined {
  const code = slug.toUpperCase().replace(/-/g, '_') as ErrorCode;
  return code in ERROR_CATALOG ? code : undefined;
}
