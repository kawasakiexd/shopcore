# ShopCore API — Architecture

Status: approved for implementation · Date: 2026-10-15 · Versions verified against the npm registry on 2026-10-15.

Read [SPEC.md](./SPEC.md) first for behaviour. This document defines **how** it is built. [PLAN.md](./PLAN.md) defines the order of work and the decisions log (referenced here as `D<n>`).

---

## 1. Overview

```mermaid
flowchart LR
    client[Swagger UI / curl / future Flowly dashboard] -->|HTTPS| caddy[Caddy 2.11<br/>shared reverse proxy]
    caddy -->|docker network 'proxy'| api[ShopCore API<br/>NestJS 12 on Node 24]
    api --> pg[(PostgreSQL 18)]
    api --> redis[(Redis 8<br/>rate limits + cache)]
    api -->|presign, head, delete| r2[(Cloudflare R2<br/>product images)]
    client -->|PUT presigned URL| r2
    client -->|GET images| cdn[R2 custom domain<br/>shopcore-cdn.&lt;domain&gt;]
    api -->|Checkout Sessions, refunds| stripe[Stripe API<br/>test mode]
    stripe -->|signed webhooks| caddy
    api -->|order confirmation| resend[Resend]
```

- **Modular monolith**: one NestJS application, feature modules with one-directional dependencies. No microservices, CQRS, event sourcing or queues (D1).
- **ESM end to end**: `"type": "module"`, `module: nodenext`. NestJS 12 and Prisma 7 both ship ESM-first (D2).
- **Schema-first validation**: Zod 4 schemas validated by Nest 12's built-in `StandardSchemaValidationPipe`; the same schemas generate OpenAPI (D5).
- **Single instance** on one VPS. Redis-backed throttling/cache are multi-instance-safe; cron jobs and the demo maintenance flag assume one instance (D34).

## 2. Technology stack

All versions verified on 2026-10-15. Use caret ranges (`^x.y.z`) in `package.json` unless the "Pin" column says otherwise. Commit `pnpm-lock.yaml`.

### 2.1 Runtime and tooling

| Component | Version | Pin | Why |
| --- | --- | --- | --- |
| Node.js | 24 LTS "Krypton" (24.22) | `.nvmrc` = `24`, `engines.node` = `>=24.11` | Current Active LTS on 2026-10-15 (Node 26 becomes LTS on 2026-10-28; bump later is a one-line change, D3). Satisfies Nest 12 (`require(esm)`, schematics need ≥24.15), Prisma 7 (≥24.0) and nestjs-pino 5 (≥22.12) |
| pnpm | 12.11 | `packageManager: "pnpm@12.11.2"` | Owner convention. pnpm 11+ reads settings only from `pnpm-workspace.yaml` and requires `allowBuilds` for packages with install scripts (D4) |
| TypeScript | 6.0 (6.0.3) | `~6.0.3` | TS 7.0 (native) is `latest`, but `typescript-eslint` supports `<6.1.0` and `@nestjs/swagger` peers `^5.5 \|\| ^6.0` (D6). TS 6 defaults: `strict: true`, `types: []`, `rootDir: .` — set explicitly |
| PostgreSQL | 18 (`postgres:18-alpine`, 18.6) | major tag | Current stable major (19 is beta). Note: the 18 image stores data under `/var/lib/postgresql` (mount that path, not `/var/lib/postgresql/data`) |
| Redis | 8 (`redis:8-alpine`, 8.10) | major tag | Rate-limit storage and cache; RESP3 by default with ioredis 6 |
| Caddy | 2.11 | shared proxy (outside this repo) | Automatic HTTPS, simple site snippets |
| Stripe CLI | 1.53 | dev machine only | `stripe listen` webhook forwarding, `stripe events resend` |

### 2.2 Production dependencies

| Package | Version | Why |
| --- | --- | --- |
| `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express` | 12.1 | Framework. Express adapter (D7): default, Express 5, raw body via `rawBody: true`, best ecosystem fit for pino-http and Swagger UI |
| `@nestjs/config` | 12.0 | Env loading; v12 validates through Standard Schema, so a Zod schema plugs in directly |
| `@nestjs/swagger` | 12.0 | OpenAPI + Swagger UI; v12 converts Zod (≥4.2) schemas from `@Body/@Query/@Param({ schema })` natively |
| `@nestjs/jwt` | 12.0 | JWT sign/verify. Custom guards instead of Passport (D9) |
| `@nestjs/throttler` | 6.7 | Rate limiting; custom Redis storage (D11) |
| `@nestjs/schedule` | 12.0 | Cron jobs: order expiry sweeper, token cleanup, nightly demo reset |
| `@nestjs/terminus` | 12.1 | Health checks via `HealthIndicatorService` (legacy `HealthIndicator` API removed in v12) |
| `nestjs-pino` / `pino` / `pino-http` | 5.3 / 10.4 / 11.0 | Structured JSON logs with request IDs |
| `zod` | 4.6 | Validation, env schema, OpenAPI source (D5) |
| `prisma` | **7.10.0** | Exact pin. CLI is a *production* dependency because the runtime image runs `prisma migrate deploy` (D16). npm `latest` dist-tag currently points to `8.0.0-rc.23` — never install without the version (D15) |
| `@prisma/client` | **7.10.0** | Exact pin. Runtime for the generated client (Rust-free, `prisma-client` generator) |
| `@prisma/adapter-pg` | **7.10.0** | Exact pin. Driver adapter is mandatory in Prisma 7; brings `pg` 8.x |
| `ioredis` | 6.0 | Single Redis client for throttler storage, cache, quotas, locks, health (D12). v6: Node ≥20, RESP3 default |
| `stripe` | 23.0 | Pinned API version `2026-09-30.endive` (the version this SDK major is typed against) |
| `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` | 3.1152 | R2 is S3-compatible; presigned PUT uploads |
| `argon2` | 0.45 | argon2id password hashing (prebuilt binaries for linux-glibc) |
| `resend` | 6.33 | Transactional email (Could) |
| `rxjs` | 7.8 | Nest peer |
| `reflect-metadata` | 0.2 | Nest peer (decorator metadata) |

### 2.3 Development dependencies

| Package | Version | Why |
| --- | --- | --- |
| `@nestjs/cli` | 12.0 | `nest build` / `nest start --watch` (tsc builder) |
| `typescript` | ~6.0.3 | See above |
| `@types/node` | ^24.19 | Node 24 typings (`types: ["node"]` is mandatory under TS 6) |
| `@types/express` | ^5.0 | `import type { Request, Response } from 'express'` |
| `eslint` | 10.12 | Flat config only |
| `@eslint/js` | 10.0 | Recommended JS rules |
| `typescript-eslint` | 8.71 | Type-checked rules; supports ESLint 10 and TS <6.1 |
| `eslint-config-prettier` | 10.1 | Turns off formatting rules (Prettier runs separately) |
| `globals` | 17.13 | Node globals for ESLint |
| `prettier` | 3.9 | Formatting |
| `pino-pretty` | 13.2 | Human-readable logs in development only |
| `tsx` | 4.23 | Runs TS scripts and `prisma db seed` in development (resolves `.js` specifiers to `.ts`) |
| `sharp` | 0.35 | Generates placeholder seed images (dev script only, D29) |

### 2.4 Considered and rejected

| Option | Decision |
| --- | --- |
| `class-validator` + `class-transformer` | Rejected in favour of Zod: one schema for validation, types (`z.infer`), OpenAPI and env; no decorator-heavy DTO classes (D5) |
| `nestjs-zod` | Incompatible: peers `@nestjs/common ^10 \|\| ^11` only. Not needed — Nest 12 has native Standard Schema support |
| `helmet` | Not needed: Nest 12.1 `app.useSecurityHeaders()` sets the same defaults as Helmet 8 without a dependency (D8) |
| `@nestjs/passport` + `passport-jwt` | Not needed for a single bearer strategy; a 40-line guard is clearer (D9) |
| `@nestjs/cache-manager` + `cache-manager` + `@keyv/redis` | Version split (`cache-manager` 7 depends on `keyv ^5`, `@keyv/redis` 6 peers `keyv ^6`), brings a second Redis client (`@redis/client`), no atomic namespace invalidation. A small `CacheService` on ioredis is simpler (D13) |
| `@nest-lab/throttler-storage-redis` | Peers stop at Nest 11. A ~50-line `ThrottlerStorage` with a Lua script is used instead (D11) |
| `dotenv` | Not needed: `@nestjs/config` loads `.env` for the app; `prisma.config.ts` and scripts use Node's built-in `process.loadEnvFile()` (D17) |
| Fastify adapter | Faster, but Express is the Nest default with simpler raw-body/Swagger/pino integration; performance is irrelevant at demo scale (D7) |
| TypeScript 7 (native) | Blocked by typescript-eslint and @nestjs/swagger peer ranges (D6) |
| Prisma 8 (RC) | Not stable; new contract-based API. Stay on 7.10 (D15) |

## 3. Repository layout

```text
shopcore/
├── .github/
│   └── workflows/
│       ├── ci.yml                       # lint, typecheck, build, prisma validate, drift check, docker build
│       └── deploy.yml                   # build → GHCR → SSH deploy (on CI success on main)
├── assets/
│   └── seed-images/
│       ├── <product-slug>.webp          # 50 committed images, 800×800 WebP
│       └── CREDITS.md                   # source/licence per image
├── deploy/
│   └── shopcore.caddy                   # site snippet for the shared Caddy proxy
├── docs/
│   ├── SPEC.md
│   ├── ARCHITECTURE.md
│   ├── PLAN.md
│   └── screenshots/                     # README / gig images (final phase)
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│       └── 20261016000000_init/migration.sql
├── scripts/
│   ├── generate-seed-images.ts          # sharp placeholders → assets/seed-images
│   └── upload-seed-images.ts            # assets/seed-images → R2 seed/ prefix (idempotent)
├── src/
│   ├── main.ts                          # bootstrap: NestFactory, logger, configureApp, listen
│   ├── app.module.ts                    # root module, global guards/filter/pipe registration
│   ├── app.setup.ts                     # configureApp(app): versioning, CORS, headers, body parser, trust proxy, Swagger
│   ├── swagger.ts                       # DocumentBuilder, document factory, ProblemDetails component
│   ├── config/
│   │   └── env.schema.ts                # Zod env schema + Env type
│   ├── common/
│   │   ├── auth/
│   │   │   ├── auth-user.ts             # AuthUser type, AuthenticatedRequest
│   │   │   ├── current-user.decorator.ts
│   │   │   ├── public.decorator.ts
│   │   │   └── roles.decorator.ts
│   │   ├── errors/
│   │   │   ├── error-catalog.ts         # ErrorCode → { status, title, description }
│   │   │   ├── domain.exception.ts
│   │   │   ├── problem-details.ts       # ProblemDetails type + Zod schema (for OpenAPI)
│   │   │   ├── problem-details.filter.ts
│   │   │   └── validation-exception.factory.ts
│   │   ├── http/
│   │   │   ├── api-docs.decorators.ts   # ApiZodResponse, ApiProblems, ApiPaginatedResponse
│   │   │   ├── common.schemas.ts        # uuidParam, slugParam, pagination query, dateRange
│   │   │   ├── money.ts                 # Money type/schema, toMoney(), formatMoney()
│   │   │   ├── pagination.ts            # PageMeta, toPage(), paginate helpers
│   │   │   └── zod-openapi.ts           # zodToOpenApi(schema, io)
│   │   ├── throttling/
│   │   │   ├── redis-throttler.storage.ts
│   │   │   ├── strict-throttle.decorator.ts
│   │   │   └── throttler.options.ts
│   │   └── utils/
│   │       ├── crypto.ts                # randomToken(), sha256Hex()
│   │       ├── prng.ts                  # mulberry32 seeded PRNG
│   │       └── slugify.ts
│   ├── infra/
│   │   ├── cache/{cache.module.ts, cache.service.ts}
│   │   ├── mail/{mail.module.ts, mail.service.ts, order-confirmation.template.ts}
│   │   ├── prisma/{prisma.module.ts, prisma.service.ts, prisma-errors.ts}
│   │   ├── redis/{redis.module.ts, redis.constants.ts}
│   │   ├── storage/{storage.module.ts, storage.service.ts, image-signature.ts}
│   │   └── stripe/{stripe.module.ts, stripe.constants.ts}
│   ├── modules/
│   │   ├── system/{system.module.ts, root.controller.ts, health.controller.ts, health.indicators.ts, problems.controller.ts}
│   │   ├── auth/{auth.module.ts, auth.controller.ts, auth.service.ts, tokens.service.ts, password.service.ts,
│   │   │         jwt-auth.guard.ts, roles.guard.ts, auth.schemas.ts, token-cleanup.job.ts}
│   │   ├── users/{users.module.ts, me.controller.ts, admin-users.controller.ts, users.service.ts, users.schemas.ts, users.mapper.ts}
│   │   ├── catalog/{catalog.module.ts, categories.controller.ts, admin-categories.controller.ts,
│   │   │            products.controller.ts, admin-products.controller.ts, admin-product-images.controller.ts,
│   │   │            categories.service.ts, products.service.ts, product-images.service.ts, upload-quota.service.ts,
│   │   │            catalog.schemas.ts, catalog.mapper.ts}
│   │   ├── cart/{cart.module.ts, cart.controller.ts, cart.service.ts, cart.schemas.ts, cart.mapper.ts}
│   │   ├── orders/{orders.module.ts, orders.controller.ts, admin-orders.controller.ts, orders.service.ts,
│   │   │           inventory.service.ts, order-transitions.ts, order-expiry.job.ts, orders.schemas.ts, orders.mapper.ts}
│   │   ├── payments/{payments.module.ts, checkout.controller.ts, checkout-pages.controller.ts, stripe-webhook.controller.ts,
│   │   │             payments.service.ts, stripe-webhook.service.ts, payments.schemas.ts}
│   │   ├── stats/{stats.module.ts, stats.controller.ts, stats.service.ts, stats.schemas.ts}
│   │   └── demo/{demo.module.ts, demo.controller.ts, demo.service.ts, demo-reset.job.ts, demo-maintenance.guard.ts, demo.constants.ts}
│   ├── database/
│   │   └── seed/
│   │       ├── seed.ts                  # runSeed(prisma, { now }): truncate-free insert of all seed data
│   │       ├── seed.cli.ts              # standalone entry (prisma db seed, prod one-off)
│   │       ├── orders.generator.ts      # deterministic historical orders
│   │       └── data/{categories.ts, products.ts, users.ts}
│   ├── cli/
│   │   └── demo-reset.cli.ts            # boots Nest app context, runs DemoService.reset()
│   └── generated/prisma/                # prisma generate output (gitignored)
├── .dockerignore
├── .env.example
├── .gitignore
├── .nvmrc
├── .prettierignore
├── .prettierrc.json
├── CLAUDE.md
├── Dockerfile
├── LICENSE                              # MIT
├── README.md
├── docker-compose.yml                   # dev: postgres, redis (+ api/migrate under profile "app")
├── docker-compose.prod.yml              # VPS: migrate, api, postgres, redis
├── eslint.config.mjs
├── nest-cli.json
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml                  # allowBuilds
├── prisma.config.ts
├── tsconfig.json                        # typecheck (noEmit), includes scripts + prisma.config.ts
└── tsconfig.build.json                  # emit src → dist
```

File naming: kebab-case, suffix by role (`.controller.ts`, `.service.ts`, `.module.ts`, `.schemas.ts`, `.mapper.ts`, `.guard.ts`, `.job.ts`, `.decorator.ts`). Relative imports end in `.js`. No barrel `index.ts` files (they create cycles under ESM).

## 4. Modules

### 4.1 Responsibilities

| Module | Owns | Exposes |
| --- | --- | --- |
| `PrismaModule` (global) | `PrismaService` (extends generated `PrismaClient`, `PrismaPg` adapter), connect/disconnect | `PrismaService` |
| `RedisModule` (global) | Single ioredis client under token `REDIS`; `quit()` on shutdown | `REDIS` |
| `CacheModule` (global) | Versioned-namespace JSON cache (`getOrSet`, `bump`) | `CacheService` |
| `StorageModule` | R2 `S3Client`, presign, head, range read, delete, delete-by-prefix, public URL builder | `StorageService` |
| `StripeModule` | Stripe client under token `STRIPE` with pinned API version | `STRIPE` |
| `MailModule` | Resend client, allowlist logic, templates | `MailService` |
| `SystemModule` | `/` redirect, `/health`, `/health/live`, `/problems/{slug}` | — |
| `AuthModule` | Register/login/refresh/logout, JWT, refresh-token families, argon2, guards, token cleanup job | `TokensService`, `PasswordService`, `JwtAuthGuard`, `RolesGuard`, `JwtModule` |
| `UsersModule` | `/v1/me*`, `/v1/admin/users*` | `UsersService` |
| `CatalogModule` | Categories, products, product images, upload quota, catalog cache usage | `ProductsService` (read helpers for cart) |
| `CartModule` | `/v1/cart*` | `CartService` |
| `OrdersModule` | Order creation, inventory reserve/release, state transitions, history, expiry sweeper, admin order endpoints | `OrdersService` |
| `PaymentsModule` | Checkout session endpoint, Stripe webhook, idempotent event processing, refunds, success/cancel pages | — |
| `StatsModule` | `/v1/admin/stats/*` raw SQL aggregates, stats cache | — |
| `DemoModule` | `/v1/demo`, nightly reset job, maintenance guard | `DemoService`, `DemoMaintenanceGuard` |

### 4.2 Dependency graph (arrows = "imports"; no cycles allowed)

```mermaid
flowchart TD
    App[AppModule] --> System & Auth & Users & Catalog & Cart & Orders & Payments & Stats & Demo
    Users --> Auth
    Cart --> Catalog
    Orders --> Stripe
    Payments --> Orders
    Payments --> Stripe
    Payments --> Mail
    Catalog --> Storage
    Demo --> Storage
    subgraph infra["Global infra (available to every module)"]
      Prisma[PrismaModule]
      Redis[RedisModule]
      Cache[CacheModule]
    end
```

Rules:
- Feature modules may depend on infra modules and on "lower" feature modules only in the direction shown. `OrdersModule` never imports `PaymentsModule`; it calls Stripe directly for `sessions.retrieve/expire` (cancel and sweeper).
- Services talk to Prisma directly; there is no repository layer (Prisma already is one, D14).
- Controllers are thin: parse (via schema) → call one service method → map → return.
- Mappers (`*.mapper.ts`) are pure functions from Prisma rows to response types. Never return Prisma objects from controllers.

### 4.3 Global enhancers (registered in `AppModule.providers`, in this order)

1. `APP_GUARD` → `ThrottlerGuard` (from `@nestjs/throttler`, configured in §8.3)
2. `APP_GUARD` → `DemoMaintenanceGuard` (503 while resetting; health routes exempt)
3. `APP_GUARD` → `JwtAuthGuard` (skips routes marked `@Public()`; sets `req.user`)
4. `APP_GUARD` → `RolesGuard` (checks `@Roles(...)`)
5. `APP_PIPE` → `new StandardSchemaValidationPipe({ exceptionFactory })`
6. `APP_FILTER` → `ProblemDetailsFilter`

## 5. Data model

### 5.1 ER overview

```mermaid
erDiagram
    users ||--o{ refresh_tokens : has
    users ||--o{ cart_items : has
    users ||--o{ orders : places
    categories ||--o{ products : contains
    products ||--o{ product_images : has
    products ||--o{ cart_items : "in"
    products ||--o{ order_items : "snapshot of"
    orders ||--|{ order_items : contains
    orders ||--o{ payments : "paid via"
    orders ||--o{ order_status_changes : history
    users |o--o{ order_status_changes : "acted"
    stripe_events {
        string id PK "evt_..."
        string type
    }
```

### 5.2 Prisma schema (`prisma/schema.prisma`)

```prisma
generator client {
  provider               = "prisma-client"
  output                 = "../src/generated/prisma"
  runtime                = "nodejs"
  moduleFormat           = "esm"
  generatedFileExtension = "ts"
  importFileExtension    = "js"
}

datasource db {
  provider = "postgresql"
}

enum Role {
  CUSTOMER
  ADMIN

  @@map("role")
}

enum ProductStatus {
  DRAFT
  ACTIVE
  ARCHIVED

  @@map("product_status")
}

enum OrderStatus {
  PENDING
  PAID
  SHIPPED
  DELIVERED
  CANCELLED
  EXPIRED

  @@map("order_status")
}

enum PaymentStatus {
  OPEN
  SUCCEEDED
  EXPIRED
  REFUNDED

  @@map("payment_status")
}

enum ActorType {
  SYSTEM
  CUSTOMER
  ADMIN

  @@map("actor_type")
}

enum TokenRevokeReason {
  ROTATED
  LOGOUT
  LOGOUT_ALL
  REUSE_DETECTED
  PASSWORD_CHANGED
  USER_BLOCKED

  @@map("token_revoke_reason")
}

model User {
  id           String   @id @default(uuid(7)) @db.Uuid
  email        String   @unique @db.VarChar(254)
  passwordHash String   @map("password_hash")
  name         String   @db.VarChar(80)
  role         Role     @default(CUSTOMER)
  isBlocked    Boolean  @default(false) @map("is_blocked")
  isProtected  Boolean  @default(false) @map("is_protected")
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt    DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  refreshTokens RefreshToken[]
  cartItems     CartItem[]
  orders        Order[]
  statusChanges OrderStatusChange[]

  @@index([createdAt])
  @@index([role, createdAt])
  @@map("users")
}

model RefreshToken {
  id            String             @id @default(uuid(7)) @db.Uuid
  userId        String             @map("user_id") @db.Uuid
  familyId      String             @map("family_id") @db.Uuid
  parentId      String?            @map("parent_id") @db.Uuid
  tokenHash     String             @unique @map("token_hash") @db.Char(64)
  expiresAt     DateTime           @map("expires_at") @db.Timestamptz(3)
  revokedAt     DateTime?          @map("revoked_at") @db.Timestamptz(3)
  revokedReason TokenRevokeReason? @map("revoked_reason")
  ip            String?            @db.VarChar(45)
  userAgent     String?            @map("user_agent") @db.VarChar(255)
  createdAt     DateTime           @default(now()) @map("created_at") @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, revokedAt])
  @@index([familyId])
  @@index([expiresAt])
  @@map("refresh_tokens")
}

model Category {
  id          String   @id @default(uuid(7)) @db.Uuid
  name        String   @db.VarChar(60)
  slug        String   @unique @db.VarChar(80)
  description String?  @db.VarChar(500)
  position    Int      @default(0)
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  products Product[]

  @@index([position, name])
  @@map("categories")
}

model Product {
  id          String        @id @default(uuid(7)) @db.Uuid
  categoryId  String        @map("category_id") @db.Uuid
  name        String        @db.VarChar(120)
  slug        String        @unique @db.VarChar(140)
  sku         String        @unique @db.VarChar(40)
  description String        @db.VarChar(5000)
  priceAmount Int           @map("price_amount")
  currency    String        @default("USD") @db.Char(3)
  stock       Int           @default(0)
  status      ProductStatus @default(DRAFT)
  archivedAt  DateTime?     @map("archived_at") @db.Timestamptz(3)
  createdAt   DateTime      @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt   DateTime      @updatedAt @map("updated_at") @db.Timestamptz(3)

  category   Category       @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  images     ProductImage[]
  cartItems  CartItem[]
  orderItems OrderItem[]

  @@index([status, categoryId])
  @@index([status, priceAmount])
  @@index([status, createdAt])
  @@index([name(ops: raw("gin_trgm_ops"))], type: Gin, map: "products_name_trgm_idx")
  @@index([description(ops: raw("gin_trgm_ops"))], type: Gin, map: "products_description_trgm_idx")
  @@map("products")
}

model ProductImage {
  id          String   @id @default(uuid(7)) @db.Uuid
  productId   String   @map("product_id") @db.Uuid
  key         String   @unique @db.VarChar(300)
  alt         String?  @db.VarChar(200)
  position    Int      @default(0)
  contentType String   @map("content_type") @db.VarChar(50)
  sizeBytes   Int      @map("size_bytes")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(3)

  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@index([productId, position])
  @@map("product_images")
}

model CartItem {
  userId    String   @map("user_id") @db.Uuid
  productId String   @map("product_id") @db.Uuid
  quantity  Int
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@id([userId, productId])
  @@index([productId])
  @@map("cart_items")
}

model Order {
  id              String      @id @default(uuid(7)) @db.Uuid
  number          Int         @unique @default(autoincrement())
  userId          String      @map("user_id") @db.Uuid
  status          OrderStatus @default(PENDING)
  currency        String      @db.Char(3)
  subtotalAmount  Int         @map("subtotal_amount")
  totalAmount     Int         @map("total_amount")
  shippingAddress Json        @map("shipping_address")
  note            String?     @db.VarChar(500)
  trackingNumber  String?     @map("tracking_number") @db.VarChar(64)
  expiresAt       DateTime    @map("expires_at") @db.Timestamptz(3)
  paidAt          DateTime?   @map("paid_at") @db.Timestamptz(3)
  shippedAt       DateTime?   @map("shipped_at") @db.Timestamptz(3)
  deliveredAt     DateTime?   @map("delivered_at") @db.Timestamptz(3)
  cancelledAt     DateTime?   @map("cancelled_at") @db.Timestamptz(3)
  expiredAt       DateTime?   @map("expired_at") @db.Timestamptz(3)
  createdAt       DateTime    @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt       DateTime    @updatedAt @map("updated_at") @db.Timestamptz(3)

  user          User                @relation(fields: [userId], references: [id], onDelete: Restrict)
  items         OrderItem[]
  payments      Payment[]
  statusChanges OrderStatusChange[]

  @@index([userId, createdAt(sort: Desc)])
  @@index([status, createdAt(sort: Desc)])
  @@index([status, expiresAt])
  @@index([paidAt])
  @@map("orders")
}

model OrderItem {
  id              String  @id @default(uuid(7)) @db.Uuid
  orderId         String  @map("order_id") @db.Uuid
  productId       String  @map("product_id") @db.Uuid
  productName     String  @map("product_name") @db.VarChar(120)
  productSlug     String  @map("product_slug") @db.VarChar(140)
  productSku      String  @map("product_sku") @db.VarChar(40)
  imageKey        String? @map("image_key") @db.VarChar(300)
  unitPriceAmount Int     @map("unit_price_amount")
  quantity        Int
  lineTotalAmount Int     @map("line_total_amount")

  order   Order   @relation(fields: [orderId], references: [id], onDelete: Cascade)
  product Product @relation(fields: [productId], references: [id], onDelete: Restrict)

  @@index([orderId])
  @@index([productId])
  @@map("order_items")
}

model Payment {
  id                    String        @id @default(uuid(7)) @db.Uuid
  orderId               String        @map("order_id") @db.Uuid
  status                PaymentStatus @default(OPEN)
  stripeSessionId       String        @unique @map("stripe_session_id") @db.VarChar(255)
  stripePaymentIntentId String?       @unique @map("stripe_payment_intent_id") @db.VarChar(255)
  checkoutUrl           String?       @map("checkout_url")
  amount                Int
  currency              String        @db.Char(3)
  expiresAt             DateTime      @map("expires_at") @db.Timestamptz(3)
  succeededAt           DateTime?     @map("succeeded_at") @db.Timestamptz(3)
  refundedAt            DateTime?     @map("refunded_at") @db.Timestamptz(3)
  createdAt             DateTime      @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt             DateTime      @updatedAt @map("updated_at") @db.Timestamptz(3)

  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([orderId, status])
  @@map("payments")
}

model OrderStatusChange {
  id          String       @id @default(uuid(7)) @db.Uuid
  orderId     String       @map("order_id") @db.Uuid
  fromStatus  OrderStatus? @map("from_status")
  toStatus    OrderStatus  @map("to_status")
  actorType   ActorType    @map("actor_type")
  actorUserId String?      @map("actor_user_id") @db.Uuid
  note        String?      @db.VarChar(500)
  createdAt   DateTime     @default(now()) @map("created_at") @db.Timestamptz(3)

  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)
  actor User? @relation(fields: [actorUserId], references: [id], onDelete: SetNull)

  @@index([orderId, createdAt])
  @@map("order_status_changes")
}

model StripeEvent {
  id              String   @id @db.VarChar(255)
  type            String   @db.VarChar(100)
  stripeCreatedAt DateTime @map("stripe_created_at") @db.Timestamptz(3)
  processedAt     DateTime @default(now()) @map("processed_at") @db.Timestamptz(3)

  @@index([processedAt])
  @@map("stripe_events")
}
```

### 5.3 Hand-written SQL in the initial migration

Prisma cannot express extensions (without a preview flag) or CHECK constraints, and ignores both when diffing, so they live in the migration SQL. Create the migration with `prisma migrate dev --create-only --name init`, then edit:

```sql
-- prepend (the trigram GIN indexes below depend on it)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- append
ALTER TABLE "products" ADD CONSTRAINT "products_stock_non_negative" CHECK ("stock" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_price_positive" CHECK ("price_amount" > 0);
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_quantity_range" CHECK ("quantity" BETWEEN 1 AND 20);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_non_negative" CHECK ("total_amount" >= 0);
```

### 5.4 Modelling notes

- IDs: `uuid(7)` generated by Prisma Client (time-ordered, index-friendly). Raw SQL inserts must supply IDs (the code never does raw inserts).
- `orders.number` is a sequence (`SERIAL`); displayed as `SC-` + 6-digit zero padding. `TRUNCATE … RESTART IDENTITY` in the demo reset restarts it.
- Money columns are `INTEGER` minor units (max ≈ $21M per row — sufficient). Aggregates are cast to `bigint` in SQL and converted with `Number()`.
- `shipping_address` is `jsonb`, validated by the Zod `AddressSchema` on write and parsed with the same schema on read.
- Images store the R2 `key` only; URLs are built at response time from `R2_PUBLIC_BASE_URL` (domain change needs no migration).
- `order_items.image_key` snapshots the thumbnail key at order time.
- Cart is the set of `cart_items` rows of a user; there is no cart table.
- `Product.currency` exists for correctness of the model, but v1 only accepts `STORE_CURRENCY` on write.

## 6. Request lifecycle

```mermaid
sequenceDiagram
    participant C as Client
    participant K as Caddy
    participant E as Express middleware
    participant G as Guards
    participant P as StandardSchemaValidationPipe
    participant H as Controller → Service
    participant F as ProblemDetailsFilter
    C->>K: HTTPS request
    K->>E: HTTP (X-Forwarded-For)
    Note over E: useSecurityHeaders → pino-http (reqId, X-Request-Id) → CORS → JSON body parser (100 KB, rawBody kept)
    E->>G: route matched (/v1 URI versioning)
    Note over G: ThrottlerGuard (Redis) → DemoMaintenanceGuard → JwtAuthGuard (@Public skip) → RolesGuard
    G->>P: allowed
    Note over P: Zod schemas from @Body/@Query/@Param({ schema }) — coerce, strip/strict
    P->>H: typed input
    H-->>C: mapped JSON (200/201/204)
    G--xF: DomainException / HttpException / ThrottlerException
    P--xF: VALIDATION_FAILED
    H--xF: DomainException / Prisma error / unknown
    F-->>C: application/problem+json
```

`main.ts` order of operations:

1. `NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, bufferLogs: true, routeConflictPolicy: { duplicate: 'error', shadow: 'warn' } })`.
2. `app.useLogger(app.get(Logger))` (nestjs-pino).
3. `configureApp(app)` (from `app.setup.ts`): `app.useSecurityHeaders()` (first), `app.set('trust proxy', TRUST_PROXY_HOPS)`, `app.useBodyParser('json', { limit: '100kb' })`, `app.enableCors(...)` when `CORS_ORIGINS` is non-empty, `app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })`, `setupSwagger(app)` when `SWAGGER_ENABLED`.
4. `app.enableShutdownHooks()`.
5. `await app.listen(PORT, '0.0.0.0')`; log the URL.

Version-neutral controllers use `@Controller({ path: 'health', version: VERSION_NEUTRAL })`.

Graceful shutdown: Docker sends SIGTERM → Nest shutdown hooks → Express adapter drains in-flight requests (Nest 12) → `PrismaService.onModuleDestroy` (`$disconnect`) → `RedisModule` `quit()`. Compose `stop_grace_period: 30s`, `init: true`.

## 7. External integrations

### 7.1 Stripe

- Client: `new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2026-09-30.endive', maxNetworkRetries: 2, timeout: 10_000, appInfo: { name: 'ShopCore API', version: '1.0.0', url: 'https://github.com/<github-user>/shopcore' } })`, provided under the `STRIPE` injection token. `STRIPE_API_VERSION` constant lives in `stripe.constants.ts`.
- Calls used: `checkout.sessions.create` (idempotency key `checkout-session:<orderId>`), `checkout.sessions.retrieve`, `checkout.sessions.expire`, `refunds.create` (idempotency key `refund:<paymentIntentId>`), `webhooks.constructEvent`.
- Webhook route `POST /v1/payments/stripe/webhook`: `@Public()`, `@SkipThrottle({ default: true, strict: true })`, reads `req.rawBody` (`RawBodyRequest<Request>`), verifies `Stripe-Signature` with `STRIPE_WEBHOOK_SECRET`. Processing is idempotent via `stripe_events` (PLAN 5.4).
- Stripe Dashboard (test mode) → Developers → Webhooks → endpoint `https://shopcore-api.<domain>/v1/payments/stripe/webhook`, events `checkout.session.completed`, `checkout.session.expired`. Locally: `stripe listen --forward-to localhost:3000/v1/payments/stripe/webhook`.
- Set `STRIPE_SUPPRESS_NOTICES=true` in `.env` to silence SDK notices.

### 7.2 Cloudflare R2

- Client (`storage.service.ts`):

```ts
new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  // SDK ≥3.729 adds CRC32 checksums by default; on presigned PUTs that breaks browser/curl uploads.
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});
```

- Operations: presigned `PutObjectCommand` (5 min, signed `content-type` + `content-length`), `HeadObjectCommand`, `GetObjectCommand` with `Range: bytes=0-15` (magic bytes), `DeleteObjectCommand`, `ListObjectsV2Command` + `DeleteObjectsCommand` (batches of 1000, demo reset), `PutObjectCommand` direct (seed image upload script).
- Key layout: `seed/<product-slug>.webp` (immutable seed images), `uploads/products/<productId>/<uuidv4>.<jpg|png|webp>` (user uploads).
- Public URL: `${R2_PUBLIC_BASE_URL}/${key}` (R2 custom domain `shopcore-cdn.<domain>`; `r2.dev` is rate-limited and not for production).
- Bucket setup (one-time, per bucket `shopcore-dev`, `shopcore-prod`):
  - Custom domain connected (prod).
  - CORS policy: `[{ "AllowedOrigins": ["http://localhost:3000", "http://localhost:3001", "https://<flowly-domain>"], "AllowedMethods": ["PUT", "GET", "HEAD"], "AllowedHeaders": ["content-type"], "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 3600 }]`.
  - Lifecycle rule: prefix `uploads/` → delete objects after 1 day (prod bucket; demo safety net).
  - API token: Object Read & Write scoped to the bucket.

### 7.3 Redis

One ioredis client: `new Redis(REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 5_000, commandTimeout: 1_000, enableAutoPipelining: true })` (`import { Redis } from 'ioredis'`).

| Key pattern | Owner | TTL |
| --- | --- | --- |
| `throttle:<name>:<key>` / `throttle:<name>:<key>:block` | `RedisThrottlerStorage` | throttler ttl / blockDuration |
| `cache:<ns>:ver` | `CacheService` | 7 days |
| `cache:<ns>:v<ver>:<key>` | `CacheService` | 60–300 s |
| `quota:upload:<yyyy-mm-dd>:<ip>` | `UploadQuotaService` | 24 h |
| `lock:demo-reset` | `DemoService` | 10 min (`SET NX EX`) |

Failure policy: cache and quota fail open (log `warn`, continue); throttler storage fails open; health reports Redis down. The API never returns 5xx just because Redis is unavailable.

### 7.4 Resend (Could)

`new Resend(RESEND_API_KEY)`; `resend.emails.send({ from: EMAIL_FROM, to: [email], subject, html, text }, { idempotencyKey: 'order-paid/<orderId>' })`; the SDK returns `{ data, error }` — log `error`, never throw. Disabled (log only) when `RESEND_API_KEY` is empty; in demo mode only `EMAIL_ALLOWLIST` recipients are sent to.

## 8. Cross-cutting design

### 8.1 Validation (Zod 4 + Nest 12)

- Schemas live in `<feature>.schemas.ts`; types are `z.infer<typeof X>` (input) or `z.output<typeof X>`.
- Bodies: `z.strictObject({...})` (unknown keys rejected). Queries: `z.object({...})` with `z.coerce.number()` / `z.stringbool()`.
- Usage: `@Body({ schema: CreateProductSchema }) body: CreateProductInput`, `@Query({ schema: ListProductsQuerySchema }) query: ListProductsQuery`, `@Param('id', { schema: z.uuid() }) id: string`.
- Field docs and examples: `.meta({ description: '...', example: ... })` (copied into the OpenAPI schema). Use `example`, not `examples` (OpenAPI 3.0 target).
- Response schemas are documented, not enforced at runtime: `ApiZodResponse({ status, schema, description })` converts via `z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'output' })`.
- `validation-exception.factory.ts` maps Standard Schema issues → `DomainException('VALIDATION_FAILED', undefined, { errors: [{ path: 'items.0.quantity', message }] })` (path segments joined with `.`; segments may be `PropertyKey` or `{ key }`).

### 8.2 Errors (RFC 9457)

- `ErrorCode` union + `ERROR_CATALOG: Record<ErrorCode, { status: number; title: string; description: string }>` in `error-catalog.ts` (codes and titles exactly as SPEC §9).
- `class DomainException extends Error { constructor(readonly code: ErrorCode, readonly detail?: string, readonly extensions?: Record<string, unknown>) }`. Services throw only `DomainException`.
- `ProblemDetailsFilter` (`@Catch()`):
  - `DomainException` → catalog status/title + detail + extensions.
  - `ThrottlerException` → `RATE_LIMITED` (ensure `Retry-After`; copy from `Retry-After-strict` when only that is set).
  - Nest `HttpException`: 404 → `NOT_FOUND`, 413 → `PAYLOAD_TOO_LARGE`, 415 → `UNSUPPORTED_MEDIA_TYPE`, other 4xx → `BAD_REQUEST`, 5xx → `INTERNAL_ERROR`.
  - body-parser errors (`err.type === 'entity.parse.failed'` → `BAD_REQUEST`; `'entity.too.large'` → `PAYLOAD_TOO_LARGE`).
  - Prisma `PrismaClientKnownRequestError`: `P2002` → `CONFLICT` (services pre-map expected uniques like email/slug/sku), `P2025` → `RESOURCE_NOT_FOUND`.
  - Anything else → `INTERNAL_ERROR`, logged at `error` with stack; `detail` hidden when `NODE_ENV=production`.
  - Body: `type` = `PUBLIC_API_URL + "/problems/" + kebab(code)`, then `title`, `status`, `detail?`, `instance` = `req.originalUrl`, `code`, `requestId` = `req.id`, then the extensions spread at top level. Header `Content-Type: application/problem+json`; 401 adds `WWW-Authenticate: Bearer` (`error="invalid_token"` for `INVALID_ACCESS_TOKEN`).
  - 4xx are logged at `info` by pino-http only; 5xx at `error` by the filter.
- `/problems/{slug}` renders the catalog entry as JSON.

### 8.3 Rate limiting

`ThrottlerModule.forRootAsync` with `storage: new RedisThrottlerStorage(redis)` and two throttlers:

| Name | Scope | Limit | Key |
| --- | --- | --- | --- |
| `default` | every route (opt-out with `@SkipThrottle()`) | `THROTTLE_GLOBAL_LIMIT` (120) per 60 s | `default:<ip>` — shared across routes via a custom `generateKey` |
| `strict` | only routes decorated with `@StrictThrottle({ limit, ttl })` | per route | Nest default key (per route + IP) |

Tracker = `req.ip` (correct client IP because `trust proxy` = 1 behind Caddy; DNS for the API subdomain is DNS-only/grey-cloud so Caddy sees the real client). Health and webhook routes skip both. Code: PLAN 1.7.

### 8.4 Caching

`CacheService.getOrSet<T>(ns, key, ttlSeconds, loader)`; `CacheService.bump(ns)`. Namespaces: `catalog`, `stats`. Keys contain the namespace version, so a bump (`SET cache:<ns>:ver <Date.now()>`) invalidates everything at once without `SCAN`/`DEL`; stale entries expire by TTL. List keys use a stable serialization of the parsed query (sorted keys). Code: PLAN 1.8.

### 8.5 Logging

`LoggerModule.forRootAsync` (nestjs-pino):
- `level` from `LOG_LEVEL`; `pino-pretty` transport only when `NODE_ENV=development`.
- `genReqId`: reuse incoming `x-request-id` if it matches `^[A-Za-z0-9_-]{1,64}$`, else `randomUUID()`; set `X-Request-Id` response header.
- `customProps: (req) => ({ userId: req.user?.id })`.
- `redact`: `req.headers.authorization`, `req.headers.cookie`, `req.headers["stripe-signature"]`.
- `autoLogging.ignore`: paths starting with `/health`.
- `serializers.req`: `{ id, method, url }` only (no headers/body).
- `customLogLevel`: `>=500 → error`, `>=400 → info`, else `info`.

Domain logs via `PinoLogger`/`Logger` with structured fields: `order.paid { orderId, amount }`, `auth.refresh_reuse { userId, familyId }`, `payment.refunded { orderId, reason }`, `demo.reset { durationMs }`.

### 8.6 Auth

- `JwtAuthGuard`: reads `@Public()` metadata via `Reflector.getAllAndOverride`; extracts `Bearer` token; `jwt.verifyAsync(token, { secret, algorithms: ['HS256'], issuer: 'shopcore-api', audience: 'shopcore' })`; sets `req.user: AuthUser = { id, role, sessionId }`; errors → `UNAUTHENTICATED` (missing) / `INVALID_ACCESS_TOKEN`.
- `RolesGuard`: `@Roles('ADMIN')` on admin controllers (class level) → `FORBIDDEN` if role mismatch.
- `@CurrentUser()` param decorator returns `AuthUser`.
- Refresh tokens: PLAN 2.3.

## 9. Configuration

Validated at boot by `envSchema` (Zod) through `ConfigModule.forRoot({ isGlobal: true, cache: true, validationSchema: envSchema })`. Access via `ConfigService<Env, true>` → `config.get('PORT', { infer: true })`. Only `env.schema.ts`, `prisma.config.ts`, `seed.cli.ts` and `scripts/*` may read `process.env`.

| Name | Required | Example | Description |
| --- | --- | --- | --- |
| `NODE_ENV` | no (`development`) | `production` | `development` \| `production` |
| `PORT` | no (`3000`) | `3000` | HTTP port |
| `PUBLIC_API_URL` | yes | `https://shopcore-api.example.com` | Public base URL (problem `type` URIs, Swagger server, checkout redirect URLs). No trailing slash |
| `CORS_ORIGINS` | no (empty) | `http://localhost:3001,https://flowly.vercel.app` | Comma-separated allowlist; empty disables CORS |
| `TRUST_PROXY_HOPS` | no (`0`) | `1` | Express `trust proxy` hops (1 behind Caddy) |
| `LOG_LEVEL` | no (`info`) | `debug` | pino level |
| `SWAGGER_ENABLED` | no (`true`) | `true` | Serve `/docs` |
| `DATABASE_URL` | yes | `postgresql://shopcore:shopcore@localhost:5432/shopcore` | Postgres connection (also used by Prisma CLI) |
| `DATABASE_POOL_MAX` | no (`10`) | `10` | `pg` pool size for `PrismaPg` |
| `REDIS_URL` | yes | `redis://localhost:6379` | Redis connection |
| `JWT_ACCESS_SECRET` | yes | 64 random chars | HS256 secret, min 32 chars |
| `JWT_ACCESS_TTL_SECONDS` | no (`900`) | `900` | Access token lifetime |
| `REFRESH_TOKEN_TTL_DAYS` | no (`30`) | `30` | Refresh token lifetime |
| `STORE_CURRENCY` | no (`USD`) | `USD` | ISO 4217 uppercase, single store currency |
| `ORDER_PAYMENT_TTL_MINUTES` | no (`30`) | `30` | Pending order lifetime; 30–1440 (Stripe session minimum is 30) |
| `STRIPE_SECRET_KEY` | yes | `sk_test_51...` | Must start with `sk_test_` or `rk_test_` (live keys rejected) |
| `STRIPE_WEBHOOK_SECRET` | yes | `whsec_...` | From `stripe listen` (dev) or the dashboard endpoint (prod) |
| `STRIPE_SUPPRESS_NOTICES` | no | `true` | Read by stripe-node itself |
| `R2_ACCOUNT_ID` | yes | `0123456789abcdef...` | Cloudflare account id |
| `R2_ACCESS_KEY_ID` | yes | `...` | R2 API token key id |
| `R2_SECRET_ACCESS_KEY` | yes | `...` | R2 API token secret |
| `R2_BUCKET` | yes | `shopcore-dev` | Bucket name |
| `R2_PUBLIC_BASE_URL` | yes | `https://shopcore-cdn.example.com` | Public base for image URLs, no trailing slash |
| `UPLOAD_MAX_BYTES` | no (`5242880`) | `5242880` | Max image size |
| `UPLOAD_DAILY_QUOTA` | no (`20`) | `20` | Upload URLs per IP per day (enforced in demo mode) |
| `THROTTLE_GLOBAL_LIMIT` | no (`120`) | `120` | Requests per minute per IP |
| `RESEND_API_KEY` | no | `re_...` | Empty → emails logged, not sent |
| `EMAIL_FROM` | if `RESEND_API_KEY` | `ShopCore <orders@example.com>` | Verified Resend sender |
| `EMAIL_ALLOWLIST` | no (empty) | `owner@example.com` | Demo mode: only these recipients get real emails |
| `DEMO_MODE` | no (`false`) | `true` | Enables protections, caps, nightly reset, `/v1/demo` credentials |

Cross-field rules (`superRefine`): `EMAIL_FROM` required when `RESEND_API_KEY` set; `STRIPE_SECRET_KEY` test-only always; `NODE_ENV=production` requires `PUBLIC_API_URL` to be `https://`.

`.env.example` lists every variable above with the example values (secrets as placeholders), grouped by section with one-line comments.

## 10. Security considerations

| Threat | Mitigation |
| --- | --- |
| Credential stuffing / brute force | `strict` throttles on login/register/refresh/password; generic login errors; dummy-hash verification for unknown emails |
| Password storage | argon2id, `memoryCost: 19456` KiB, `timeCost: 2`, `parallelism: 1` (OWASP); password 8–128 chars |
| Token theft | 15-min access tokens; refresh tokens opaque, single-use, SHA-256 hashed at rest, rotated, family revoked on reuse, revoked on password change/block |
| JWT confusion | HS256 only (`algorithms: ['HS256']`), `iss`/`aud` checked, secret ≥32 chars validated at boot |
| Broken object-level authorization | Every customer query filters by `userId` from the token; foreign IDs → 404 |
| Mass assignment | Strict Zod body schemas; role/status/protected flags never accepted where not intended |
| Injection | Prisma parameterized queries; raw SQL only via tagged `$queryRaw` templates |
| CSRF | No cookies; bearer tokens only |
| CORS | Explicit origin allowlist from env; no wildcard with credentials |
| Headers | `app.useSecurityHeaders()` (Helmet 8 defaults: CSP, HSTS, nosniff, frame-ancestors…); Swagger UI works with the default CSP when served over HTTPS |
| Payload abuse | JSON limit 100 KB; images never pass through the API (presigned R2 PUT, signed type + length, 5 min expiry, HEAD + magic-byte verification, quotas) |
| Webhook spoofing | Signature verification on raw body; `livemode` events ignored; amounts re-checked against the order |
| Payment tampering | Prices computed server-side from DB; Stripe line items built from the order snapshot; client never sends prices |
| Real money | Live Stripe keys rejected at boot |
| Secrets | Env only; `.env` gitignored; `.env.example` placeholders; logs redact auth headers and signatures |
| Error leakage | No stack traces or internal messages in production problem bodies |
| Container | Non-root `node` user, prod deps only, Postgres/Redis not published on the VPS, only the `proxy` network exposed to Caddy |
| Demo abuse | Caps, quotas, protected accounts, nightly reset, R2 lifecycle on `uploads/` |

## 11. Deployment

### 11.1 Dockerfile (multi-stage)

```dockerfile
# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-trixie-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@12.11.2
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod

FROM deps AS build
COPY . .
RUN pnpm db:generate && pnpm build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json prisma.config.ts ./
COPY --chown=node:node prisma/schema.prisma ./prisma/schema.prisma
COPY --chown=node:node prisma/migrations ./prisma/migrations
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/main.js"]
```

Notes: `prisma generate` does not need `DATABASE_URL` because `prisma.config.ts` uses `process.env.DATABASE_URL` (not the throwing `env()` helper). Debian slim (not Alpine) avoids musl issues with argon2 prebuilds and the Prisma schema engine; `openssl` is required by the schema engine used by `migrate deploy`.

`.dockerignore`: `node_modules`, `dist`, `src/generated`, `.git`, `.github`, `.env*` (keep `!.env.example`), `docs`, `assets`, `coverage`, `*.log`.

### 11.2 Local development compose (`docker-compose.yml`)

```yaml
name: shopcore

services:
  postgres:
    image: postgres:18-alpine
    environment:
      POSTGRES_USER: shopcore
      POSTGRES_PASSWORD: shopcore
      POSTGRES_DB: shopcore
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U shopcore -d shopcore"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:8-alpine
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  migrate:
    profiles: [app]
    build: .
    command: ["node_modules/.bin/prisma", "migrate", "deploy"]
    env_file: .env
    environment:
      DATABASE_URL: postgresql://shopcore:shopcore@postgres:5432/shopcore
    depends_on:
      postgres: { condition: service_healthy }

  api:
    profiles: [app]
    build: .
    env_file: .env
    environment:
      DATABASE_URL: postgresql://shopcore:shopcore@postgres:5432/shopcore
      REDIS_URL: redis://redis:6379
      NODE_ENV: production
    ports: ["3000:3000"]
    init: true
    depends_on:
      migrate: { condition: service_completed_successfully }
      redis: { condition: service_healthy }

volumes:
  pgdata:
```

### 11.3 Production compose (`docker-compose.prod.yml`, on the VPS in `/opt/shopcore`)

```yaml
name: shopcore

x-api-image: &api-image ghcr.io/<github-user>/shopcore-api:${IMAGE_TAG:-latest}

services:
  postgres:
    image: postgres:18-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes: [pgdata:/var/lib/postgresql]
    networks: [internal]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 3s
      retries: 20

  redis:
    image: redis:8-alpine
    restart: unless-stopped
    command: ["redis-server", "--maxmemory", "128mb", "--maxmemory-policy", "allkeys-lru", "--save", ""]
    networks: [internal]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 20

  migrate:
    image: *api-image
    command: ["node_modules/.bin/prisma", "migrate", "deploy"]
    env_file: .env
    restart: "no"
    networks: [internal]
    depends_on:
      postgres: { condition: service_healthy }

  api:
    image: *api-image
    env_file: .env
    restart: unless-stopped
    init: true
    stop_grace_period: 30s
    mem_limit: 512m
    expose: ["3000"]
    networks:
      internal: {}
      proxy:
        aliases: [shopcore-api]
    depends_on:
      migrate: { condition: service_completed_successfully }
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "5" }

networks:
  internal: {}
  proxy:
    external: true
    name: proxy

volumes:
  pgdata:
```

The server `.env` contains `POSTGRES_USER/PASSWORD/DB`, a matching `DATABASE_URL=postgresql://…@postgres:5432/…`, `REDIS_URL=redis://redis:6379`, `NODE_ENV=production`, `TRUST_PROXY_HOPS=1`, `DEMO_MODE=true`, and every other variable from §9.

### 11.4 Caddy (shared proxy, `deploy/shopcore.caddy`)

The shared Caddy container lives outside this repo, joins the external `proxy` network and imports site files (e.g. `import /etc/caddy/sites/*.caddy`). ShopCore ships its snippet:

```caddyfile
shopcore-api.{$DOMAIN} {
	encode zstd gzip
	request_body {
		max_size 1MB
	}
	reverse_proxy shopcore-api:3000 {
		health_uri /health/live
		health_interval 30s
	}
	header -Server
	log {
		output stdout
		format json
	}
}
```

DNS: `A shopcore-api.<domain>` → VPS IP (DNS only, not proxied). `shopcore-cdn.<domain>` is an R2 custom domain (proxied by Cloudflare automatically).

### 11.5 Migrations on deploy

`migrate` is a one-shot service using the same image; `api` starts only after it exits 0 (`service_completed_successfully`). A failed migration leaves the previous `api` container running (compose does not recreate `api` if its dependency fails). Migrations are forward-only; destructive changes need a two-step migration.

### 11.6 VPS runbook (first deploy)

1. Shared proxy already running with network `docker network create proxy` and Caddy importing `/etc/caddy/sites/*.caddy`; copy `deploy/shopcore.caddy` there and reload Caddy (`docker exec caddy caddy reload --config /etc/caddy/Caddyfile`).
2. `mkdir -p /opt/shopcore && cd /opt/shopcore`; copy `docker-compose.prod.yml`; create `.env` (chmod 600).
3. Make the GHCR package public (or `docker login ghcr.io` with a read-only PAT).
4. `docker compose -f docker-compose.prod.yml up -d` → migrations run, API starts.
5. Seed once: `docker compose -f docker-compose.prod.yml run --rm api node dist/database/seed/seed.cli.js`.
6. From the dev machine, upload seed images to the prod bucket once: `R2_BUCKET=shopcore-prod pnpm seed:images:upload`.
7. Create the Stripe test-mode webhook endpoint; put its `whsec_` in `.env`; `docker compose -f docker-compose.prod.yml up -d api`.
8. Verify `https://shopcore-api.<domain>/health` and `/docs`.

### 11.7 CI (`.github/workflows/ci.yml`)

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:generate
      - run: pnpm format:check
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm build
      - run: pnpm db:validate

  migrations:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:18-alpine
        env:
          POSTGRES_USER: shopcore
          POSTGRES_PASSWORD: shopcore
          POSTGRES_DB: shopcore
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U shopcore"
          --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      DATABASE_URL: postgresql://shopcore:shopcore@localhost:5432/shopcore
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:deploy
      - run: pnpm db:drift   # exit 2 = schema.prisma and migrations disagree

  docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: docker/setup-buildx-action@v4
      - uses: docker/build-push-action@v7
        with:
          context: .
          push: false
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

No tests in CI (owner rule).

### 11.8 Deploy (`.github/workflows/deploy.yml`)

- Trigger: `workflow_run` of `CI` with `types: [completed]`, `branches: [main]`; job `if: github.event.workflow_run.conclusion == 'success'`; plus `workflow_dispatch`.
- Permissions: `contents: read`, `packages: write`.
- Steps: checkout (`ref: ${{ github.event.workflow_run.head_sha }}`), `docker/setup-buildx-action@v4`, `docker/login-action@v4` (GHCR with `GITHUB_TOKEN`), `docker/metadata-action@v6` (image `ghcr.io/${{ github.repository_owner }}/shopcore-api`, tags `latest` and `sha-<short>`), `docker/build-push-action@v7` (`push: true`, gha cache), then `appleboy/ssh-action@v1.2.5` running:
  `cd /opt/shopcore && IMAGE_TAG=sha-<short> docker compose -f docker-compose.prod.yml pull && IMAGE_TAG=sha-<short> docker compose -f docker-compose.prod.yml up -d --remove-orphans && docker image prune -f`.
- Secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`. The VPS `.env` also stores `IMAGE_TAG` only if pinning manually; otherwise the env var from the SSH command wins.

## 12. Tooling configuration

### 12.1 `package.json` (essentials)

```json
{
  "name": "shopcore-api",
  "version": "1.0.0",
  "private": true,
  "license": "MIT",
  "type": "module",
  "packageManager": "pnpm@12.11.2",
  "engines": { "node": ">=24.11" }
}
```

Scripts: see §13.

### 12.2 `pnpm-workspace.yaml`

```yaml
allowBuilds:
  argon2: true
  prisma: true
  "@prisma/engines": true
  esbuild: true
  sharp: true
```

pnpm adds any other package with install scripts as a placeholder on first install; set those to `false` unless the package fails without its script.

### 12.3 `tsconfig.json` / `tsconfig.build.json`

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "resolvePackageJsonExports": true,
    "types": ["node"],
    "strict": true,
    "strictPropertyInitialization": false,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "removeComments": true,
    "incremental": true,
    "rootDir": ".",
    "outDir": "./dist",
    "noEmit": true
  },
  "include": ["src", "scripts", "prisma.config.ts"]
}
```

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": false, "rootDir": "./src", "outDir": "./dist", "tsBuildInfoFile": "./dist/.tsbuildinfo" },
  "include": ["src"]
}
```

Under `isolatedModules` + `emitDecoratorMetadata`, types used only in decorated signatures that are type-only exports (e.g. Express `Request`) must be imported with `import type` (TS1272).

### 12.4 `nest-cli.json`

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "sourceRoot": "src",
  "compilerOptions": { "builder": "tsc", "tsConfigPath": "tsconfig.build.json", "deleteOutDir": true }
}
```

### 12.5 `eslint.config.mjs`

```js
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['dist/**', 'src/generated/**', 'coverage/**']),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/require-await': 'off',
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  { files: ['**/*.mjs'], extends: [tseslint.configs.disableTypeChecked] },
  prettier,
);
```

Do not enable `@typescript-eslint/consistent-type-imports`: converting DI constructor parameter imports to `import type` breaks Nest dependency injection metadata.

### 12.6 Prettier (`.prettierrc.json`)

```json
{ "singleQuote": true, "trailingComma": "all", "printWidth": 100, "semi": true }
```

`.prettierignore`: `dist`, `src/generated`, `pnpm-lock.yaml`, `prisma/migrations`, `assets`.

### 12.7 `prisma.config.ts`

```ts
import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx src/database/seed/seed.cli.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
```

Prisma 7 does not load `.env` by itself and `migrate dev` no longer runs `generate` or seeds automatically — scripts call them explicitly.

## 13. Scripts

| Script | Command | Purpose |
| --- | --- | --- |
| `dev` | `prisma generate && nest start --watch` | Dev server with reload on `:3000` |
| `build` | `nest build` | Compile `src` → `dist` (run `db:generate` first) |
| `start` | `node dist/main.js` | Run compiled app |
| `typecheck` | `tsc -p tsconfig.json` | Type check everything (`noEmit`) |
| `lint` | `eslint .` | Lint |
| `lint:fix` | `eslint . --fix` | Autofix |
| `format` | `prettier --write .` | Format |
| `format:check` | `prettier --check .` | CI format check |
| `db:generate` | `prisma generate` | Generate client into `src/generated/prisma` |
| `db:migrate` | `prisma migrate dev` | Create/apply migrations in dev |
| `db:deploy` | `prisma migrate deploy` | Apply migrations (CI/prod) |
| `db:seed` | `prisma db seed` | Seed (runs `tsx src/database/seed/seed.cli.ts`) |
| `db:reset` | `prisma migrate reset --force && prisma db seed` | Drop, re-migrate, re-seed (dev) |
| `db:validate` | `prisma validate` | Validate schema |
| `db:drift` | `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | Fails if migrations ≠ schema (run after `db:deploy`) |
| `db:studio` | `prisma studio` | Inspect data |
| `seed:images:generate` | `tsx scripts/generate-seed-images.ts` | Create placeholder WebP seed images |
| `seed:images:upload` | `tsx scripts/upload-seed-images.ts` | Upload seed images to `R2_BUCKET` under `seed/` |
| `demo:reset` | `tsx src/cli/demo-reset.cli.ts` | Manual demo reset (prod: `docker compose … exec api node dist/cli/demo-reset.cli.js`) |
| `stripe:listen` | `stripe listen --forward-to localhost:3000/v1/payments/stripe/webhook` | Forward test webhooks locally |
