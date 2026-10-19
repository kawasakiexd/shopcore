# ShopCore API — Implementation Plan

Read [SPEC.md](./SPEC.md) then [ARCHITECTURE.md](./ARCHITECTURE.md) before writing code. Tick every `- [ ]` when done. Run the phase **Verification** before starting the next. Do not write tests unless the owner asks.

Effort: **~56 h (7 days)**.

---

## How to work

1. Implement only files listed in the current phase (plus tiny fixes if Verification fails).
2. File naming and module graph: ARCHITECTURE §3 and §4. Relative imports end in `.js`. No barrel `index.ts`.
3. Money is integer minor units. Errors are SPEC §9 codes via `DomainException`.
4. Pin Prisma **7.10.0** exact. Never `pnpm add prisma` without the version (npm `latest` may be 8 RC).
5. If a library API differs from ARCHITECTURE, trust the installed docs, fix the code, add a Decisions log row.

---

## Phase 0 — Scaffold (4 h)

**Goal:** Nest 12 app boots on :3000, tooling green, Compose starts Postgres 18 + Redis 8.

- [x] 0.1 Root files from ARCHITECTURE §3: `package.json` with `packageManager: "pnpm@12.11.2"`, `pnpm-workspace.yaml` (`allowBuilds` for packages with install scripts: prisma, argon2, etc.), `.nvmrc` `24`, `tsconfig.json` (`strict`, `module: nodenext`, `noEmit`, `types: ["node"]`), `tsconfig.build.json`, `nest-cli.json` (tsc builder), `eslint.config.mjs`, `.prettierrc.json`, `.gitignore`, `.dockerignore`, `LICENSE` MIT, `.env.example` (ARCHITECTURE §9).
- [x] 0.2 Dependencies from ARCHITECTURE §2.2–§2.3. **Exact pin** `prisma`, `@prisma/client`, `@prisma/adapter-pg` to `7.10.0`. `"type": "module"`.
- [x] 0.3 `docker-compose.yml` — `postgres:18-alpine` (volume mount **`/var/lib/postgresql`**, not `.../data`), `redis:8-alpine`, ports on localhost. Profile `app` unused until later.
- [x] 0.4 Stub `src/main.ts` logging "shopcore". Scripts from ARCHITECTURE §13.

### Verification

```
pnpm install
docker compose up -d postgres redis
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build
```

---

## Phase 1 — Infra: env, Prisma, errors, HTTP skeleton (8 h)

**Goal:** `/health`, `/docs`, problem+json, request IDs. No business modules yet.

- [x] 1.1 `prisma.config.ts` + `prisma/schema.prisma` — **full** schema from ARCHITECTURE §5.2 (all models/enums/indexes). Generator:

```prisma
generator client {
  provider               = "prisma-client"
  output                 = "../src/generated/prisma"
  runtime                = "nodejs"
  moduleFormat           = "esm"
  generatedFileExtension = "ts"
  importFileExtension    = "js"
}
datasource db { provider = "postgresql" }
```

Prisma 7: URL lives in `prisma.config.ts` (not in the schema). Driver adapter `PrismaPg` is mandatory.

- [x] 1.2 First migration `prisma/migrations/20261016000000_init`. Include `CHECK (stock >= 0)` on products. `pnpm db:generate && pnpm db:migrate`.
- [x] 1.3 `config/env.schema.ts` — every var in ARCHITECTURE §9, `superRefine` rules (test-only Stripe keys, `EMAIL_FROM` if Resend, prod HTTPS public URL). `ConfigModule.forRoot({ isGlobal: true, cache: true, validationSchema: envSchema })`.
- [x] 1.4 `infra/prisma/{prisma.module,prisma.service,prisma-errors}.ts` — `PrismaService` extends generated client, adapter, connect/disconnect.
- [x] 1.5 `infra/redis/*` — one ioredis client, token `REDIS`, `quit()` on shutdown.
- [x] 1.6 Errors: `error-catalog.ts` (SPEC §9 **verbatim**), `domain.exception.ts`, `problem-details.ts`, `problem-details.filter.ts`, `validation-exception.factory.ts` as ARCHITECTURE §8.2.
- [x] 1.7 HTTP helpers: `common.schemas.ts`, `money.ts`, `pagination.ts`, `zod-openapi.ts`, `api-docs.decorators.ts`.
- [x] 1.8 `app.setup.ts` + `swagger.ts` + `main.ts` — order ARCHITECTURE §6. `rawBody: true`. URI versioning `/v1`. Security headers first. `trust proxy` from env.
- [x] 1.9 `system/*` — `GET /` → 302 `/docs`, `/health/live`, `/health` (Terminus db+redis, Nest 12 `HealthIndicatorService`), `/problems/{slug}`, `/docs`.
- [x] 1.10 Logging: nestjs-pino as ARCHITECTURE §8.5. Throttler + Redis storage stub (full in 1.11). CacheService stub (full in 1.12).
- [x] 1.11 `RedisThrottlerStorage` + `ThrottlerModule.forRootAsync` (ARCHITECTURE §8.3). `generateKey` for global limiter = `default:<ip>`. `@SkipThrottle` on health/webhook later.
- [x] 1.12 `CacheService.getOrSet` / `bump` (ARCHITECTURE §8.4). Namespaces `catalog`, `stats`.

### Verification

```
pnpm db:generate && pnpm db:migrate
pnpm dev
curl -sI http://localhost:3000/health/live     # 200
curl -s  http://localhost:3000/health          # db+redis up
curl -sI http://localhost:3000/                # 302 /docs
open http://localhost:3000/docs
```

Unknown route → `404 NOT_FOUND` problem+json with `requestId`. Invalid JSON body → `400`. AC items for health/docs.

---

## Phase 2 — Auth (8 h)

**Goal:** SPEC §5.3–§5.4, §6.

- [x] 2.1 `common/auth/{auth-user,public.decorator,roles.decorator,current-user.decorator}.ts`.
- [x] 2.2 `password.service.ts` — argon2id `memoryCost: 19456`, `timeCost: 2`, `parallelism: 1`. Dummy-hash verify on unknown email (timing).
- [x] 2.3 `tokens.service.ts` — access JWT HS256 15 min, claims `sub, role, sid, iss=shopcore-api, aud=shopcore`. Refresh: 32 random bytes base64url, store SHA-256, 30 days, **single use**. Rotation + 10 s reuse grace (SPEC §6.5):

```ts
// reuse: presented token has revokedReason=ROTATED and rotatedAt < now - 10s
// → revoke entire family (REUSE_DETECTED), throw REFRESH_TOKEN_REUSED
// within grace → INVALID_REFRESH_TOKEN, family lives
```

Login starts a new family. Logout revokes family. Logout-all / password change / block revoke all.

- [x] 2.4 `jwt-auth.guard.ts`, `roles.guard.ts` — ARCHITECTURE §8.6. Missing token `UNAUTHENTICATED`; bad token `INVALID_ACCESS_TOKEN` + `WWW-Authenticate`.
- [x] 2.5 Controllers/schemas for register/login/refresh/logout/logout-all. Strict throttle: register 5/h/IP, login 10/min, refresh 30/min, password 5/15min. Register always CUSTOMER. Email lowercased unique.
- [x] 2.6 `users` module: `GET/PATCH /v1/me`, `POST /v1/me/password`. Protected accounts → `DEMO_PROTECTED_RESOURCE` (flag exists even before demo seed).
- [x] 2.7 `token-cleanup.job.ts` — daily purge of expired/revoked tokens older than 7 days.
- [x] 2.8 Register global guards in AppModule order: Throttler → DemoMaintenance (stub allow-all until Phase 6) → JwtAuth → Roles. Pipe: StandardSchemaValidationPipe.

### Verification (curl)

```
# register → 201 AuthResponse
# login unknown email → 401 INVALID_CREDENTIALS (same timing as wrong password)
# GET /v1/me with access token → 200
# refresh → new pair; old refresh 401 (after grace)
# replay rotated token after 11s → 401 REFRESH_TOKEN_REUSED; subsequent refresh of that family fails
# logout → 204; unknown token still 204
```

---

## Phase 3 — Catalog + R2 (8 h)

**Goal:** SPEC §5.5, §5.9.

- [x] 3.1 Categories + products services/controllers/mappers/schemas. Public list cache 30 s (`Cache-Control: public, max-age=30`); bump `catalog` on any admin write.
- [x] 3.2 Search: `ILIKE` on name/description (q 2–100). Filters/sort/pagination as SPEC. Admin list includes DRAFT (default) + ACTIVE; ARCHIVED only when `status=ARCHIVED`. Soft delete = ARCHIVE + strip from carts.
- [x] 3.3 `storage.service.ts` — S3Client config ARCHITECTURE §7.2 (`requestChecksumCalculation: 'WHEN_REQUIRED'`). Presign PUT 5 min, signed Content-Type + Content-Length.
- [x] 3.4 Upload flow: `POST .../images/upload-url` → client PUT to R2 → `POST .../images` HEAD + magic bytes (`ffd8ff` jpeg, `89504e47` png, `52494646…57454250` webp). Key must match `uploads/products/<productId>/…`. Limit 8 images. Daily IP quota via Redis. Seed keys `seed/` are never deleted on image DELETE.
- [x] 3.5 `scripts/generate-seed-images.ts` (sharp 800×800 WebP placeholders) and `upload-seed-images.ts` (idempotent `seed/<slug>.webp`). `assets/seed-images/CREDITS.md`.
- [x] 3.6 Seed data files `database/seed/data/{categories,products,users}.ts` — 6 categories, 50 products (SPEC §8). `seed.ts` insert (no truncate yet). `prisma db seed`.

### Verification

Public `GET /v1/products?q=head&sort=price_asc` paginates. Second identical request hits Redis (log or timing). Admin create → list updates. Presign → PUT → attach → product.detail has url. Bad magic bytes → `UPLOAD_INVALID`. 9th image → `IMAGE_LIMIT_REACHED`.

---

## Phase 4 — Cart + orders + inventory (8 h)

**Goal:** SPEC §5.6–§5.7, §7.3–§7.5. **No Stripe session yet** — checkout endpoint can 501 until Phase 5, but `POST /v1/orders` must reserve stock.

- [x] 4.1 Cart: set-quantity semantics, 20 distinct items, stock check → `INSUFFICIENT_STOCK { available }`. Inactive product → `PRODUCT_UNAVAILABLE`. Foreign ids → 404.
- [x] 4.2 `inventory.service.ts` — lock order by product id:

```sql
UPDATE products SET stock = stock - $qty
WHERE id = $id AND status = 'ACTIVE' AND stock >= $qty
```

0 rows → collect short lines → rollback → `OUT_OF_STOCK`. Release is the inverse, only with the conditional status update.

- [x] 4.3 `order-transitions.ts` — table from SPEC §7.4. `UPDATE orders SET status=$to WHERE id=$id AND status=$from` ; 0 rows → `INVALID_STATUS_TRANSITION`. Write `OrderStatusChange`.
- [x] 4.4 `POST /v1/orders` — transaction: validate cart → reserve (sorted ids) → snapshot line prices → create PENDING `expiresAt = now+ORDER_PAYMENT_TTL_MINUTES` → clear cart. Number `SC-000123` (monotonic; implement as `SELECT … FOR UPDATE` on a counter row or `MAX` in the same tx — pick MAX+1 with a `store_counters` row to avoid races; **Decision D20: dedicated `order_counters` table with a single row**).
- [x] 4.5 Customer list/get/cancel. Cancel PENDING: if a session exists, expire it in Phase 5; this phase just releases stock. Ownership: other users' ids → 404.
- [x] 4.6 `order-expiry.job.ts` stub every 5 min — full Stripe reconcile in Phase 5; for now expire PENDING with `expiresAt < now-2min` and no session.

### Verification

Two parallel `POST /v1/orders` for the last unit (two users, qty 1, stock 1) → one 201, one `409 OUT_OF_STOCK`. Cart empty → `CART_EMPTY`. Cancel PENDING → stock restored. Paid/shipped cancel → `INVALID_STATUS_TRANSITION` (once those statuses exist).

---

## Phase 5 — Stripe Checkout + webhooks (8 h)

**Goal:** SPEC §5.8, §7.6.

- [x] 5.1 `StripeModule` — `new Stripe(key, { apiVersion: '2026-09-30.endive', … })` as ARCHITECTURE §7.1. Boot fails on live keys.
- [x] 5.2 `POST /v1/orders/{id}/checkout` — reuse open unexpired session; else `checkout.sessions.create` with `idempotencyKey: checkout-session:<orderId>`, `price_data` from snapshots, `client_reference_id` + `metadata.orderId`, `success_url`/`cancel_url` on this API, `expires_at` aligned to order. Align order `expiresAt` to session.
- [x] 5.3 Webhook controller: `@Public()`, skip throttle, **raw body**:

```ts
@Post('stripe/webhook')
async handle(
  @Req() req: RawBodyRequest<Request>,
  @Headers('stripe-signature') sig: string,
) {
  const event = this.stripe.webhooks.constructEvent(
    req.rawBody!, sig, this.webhookSecret,
  );
  await this.webhooks.process(event);
  return { received: true };
}
```

Bad sig → `WEBHOOK_SIGNATURE_INVALID`. `livemode: true` → ignore 200.

- [x] 5.4 Idempotency:

```ts
await prisma.$transaction(async (tx) => {
  const inserted = await tx.stripeEvent.createMany({
    data: { id: event.id, type: event.type },
    skipDuplicates: true,
  });
  if (inserted.count === 0) return; // duplicate
  // apply side effects in this same tx
});
```

Failed processing must roll back the event row so Stripe retries.

- [x] 5.5 `checkout.session.completed`: require `payment_status=paid` and amount/currency match; `PENDING → PAID`. Mismatch / wrong status → automatic `refunds.create` (`idempotencyKey: refund:<pi>`) + log. `checkout.session.expired` → `PENDING → EXPIRED` + stock release (no-op if final).
- [x] 5.6 Sweeper: pending + `expiresAt` older than 2 min → retrieve session; if paid complete, mark PAID (missed webhook); if open, `sessions.expire` then EXPIRED; no session → EXPIRED. Customer cancel with open session: expire first; if Stripe says complete → `PAYMENT_IN_PROGRESS`.
- [x] 5.7 Success/cancel HTML pages SPEC §5.8. Mail Could: `MailService` after PAID commit; demo allowlist; never throw.

### Verification

```
pnpm stripe:listen
# checkout → open URL → pay 4242… → webhook → order PAID, stock stays reserved (not double-released)
# decline / close session → expired webhook or sweeper → EXPIRED, stock restored
# stripe events resend <id> → still 200, no double PAID
curl without signature → 400 WEBHOOK_SIGNATURE_INVALID
```

---

## Phase 6 — Admin orders/users/stats + demo reset (8 h)

**Goal:** SPEC §5.10–§5.12, §8.

- [x] 6.1 Admin orders list/get + `PATCH .../status` (SHIPPED/DELIVERED/CANCELLED) with trackingNumber rule. Stats cache bump on paid/cancel/status.
- [x] 6.2 Admin users list/get/patch. Cannot modify self. Protected → `DEMO_PROTECTED_RESOURCE`. Block revokes sessions.
- [x] 6.3 Stats endpoints — raw SQL aggregates, UTC day buckets, zero-fill, cache 5 min, namespace `stats`.
- [x] 6.4 `GET /v1/demo` — credentials only when `DEMO_MODE=true`.
- [x] 6.5 `DemoService.reset()`: Redis lock `lock:demo-reset`; set maintenance flag; all non-health routes → `503 DEMO_RESET_IN_PROGRESS` `Retry-After: 30`; truncate business tables; `runSeed`; delete R2 `uploads/`; bump caches; clear flag. Nightly `03:00 UTC`. CLI `demo-reset.cli.ts`. Seed historical orders (~200 / 90 days) via `orders.generator.ts` — **no PENDING**, stock not reserved.
- [x] 6.6 Caps: 300 products, 20 categories, 1000 users → `DEMO_LIMIT_REACHED`.

### Verification

Swagger: login demo admin → ship a paid seed order → stats move. Block a non-protected user → their refresh fails `ACCOUNT_BLOCKED`. `pnpm demo:reset` while curling `/v1/products` → 503 then 200 with seed catalog restored. Protected password change → 403. AC demo rules.

---

## Phase 7 — Deploy & portfolio polish (4 h)

**Goal:** SPEC §12 AC 13–15, Docker, CI, README.

- [x] 7.1 Multi-stage `Dockerfile` (ARCHITECTURE §11). `docker-compose.prod.yml` (migrate then api, postgres, redis, external `proxy`). `deploy/shopcore.caddy`. `stop_grace_period: 30s`, `init: true`.
- [x] 7.2 `.github/workflows/ci.yml`: install, format, lint, typecheck, build, `prisma validate`, migration drift (`db:drift` against ephemeral Postgres), docker build. **No tests.** `deploy.yml` optional (GHCR + SSH).
- [x] 7.3 README.md (English):

  1. Badges (CI)
  2. Live Swagger `https://shopcore-api.<domain>/docs`
  3. Demo credentials + test card
  4. 2-minute walkthrough (register or demo login → catalog → cart → order → checkout)
  5. Mermaid architecture (ARCHITECTURE §1) + ER (ARCHITECTURE §5.1) + order state (SPEC §7.4)
  6. Stack, getting started, env, deployment

- [x] 7.4 Screenshots `docs/screenshots/`:

  | File | Shot |
  | --- | --- |
  | `swagger.png` | `/docs` with Authorize |
  | `demo.png` | `GET /v1/demo` |
  | `catalog.png` | product list JSON |
  | `checkout.png` | Stripe Checkout test page |
  | `order-paid.png` | order PAID payload |
  | `stats.png` | summary + revenue |
  | `problem.png` | a problem+json example |

- [x] 7.5 Final: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm build`. Walk SPEC §12.

---

## Effort

| Phase | Hours |
| --- | --- |
| 0 Scaffold | 4 |
| 1 Infra | 8 |
| 2 Auth | 8 |
| 3 Catalog + R2 | 8 |
| 4 Cart + orders | 8 |
| 5 Stripe | 8 |
| 6 Admin + demo | 8 |
| 7 Deploy + polish | 4 |
| **Total** | **56** |

---

## Decisions log

| ID | Decision | Why |
| --- | --- | --- |
| D1 | Modular monolith, no queues | Portfolio-sized; one VPS instance |
| D2 | ESM everywhere | Nest 12 + Prisma 7 are ESM-first |
| D3 | Node 24 LTS | Active LTS on 2026-10-15 |
| D4 | pnpm 12 + `allowBuilds` | Owner convention |
| D5 | Zod 4 + StandardSchemaValidationPipe | Nest 12 native; same schemas → OpenAPI |
| D6 | TypeScript 6.0 not 7 | eslint + swagger peer range |
| D7 | Express adapter, `rawBody: true` | Stripe signature needs the raw buffer |
| D8 | Custom JWT guards, not Passport | Less surface, enough for Bearer |
| D9 | Refresh in JSON body, not cookies | Swagger-friendly public API demo |
| D10 | Prisma 7.10 exact + `PrismaPg` | 7 requires driver adapters; npm latest may be 8 RC |
| D11 | Redis throttler storage | Multi-instance-safe even if we stay at 1 |
| D12 | One ioredis client | Cache + throttle + quota + lock |
| D13 | Reserve stock at order creation | Customer is guaranteed goods during 30 min Checkout |
| D14 | No repository layer | Prisma is the repository |
| D15 | Versioned cache bump, no SCAN | Simple invalidation |
| D16 | `prisma` is a production dependency | Runtime image runs `migrate deploy` |
| D17 | Stripe API `2026-09-30.endive` | Version stripe-node 23 is typed against |
| D18 | R2 checksums `WHEN_REQUIRED` | Presigned browser PUTs break with default CRC32 |
| D19 | CORS allowlist, Bearer only | No CSRF; future Flowly origin via env |
| D20 | `order_counters` single-row | Race-free `SC-000123` numbers |

---

## Open questions for the owner (defaults in **bold**)

1. GitHub repo / GHCR owner slug? **`github.com/<you>/shopcore`** — replace in Stripe `appInfo.url`.
2. R2 buckets? **`shopcore-dev` local, `shopcore-prod` VPS.** Create them before Phase 3 Verification.
3. Domain? **`shopcore-api.<domain>`** + **`shopcore-cdn.<domain>`**.
4. Send Resend confirmation emails on the public demo? **No** (`RESEND_API_KEY` empty; log only).
5. Seed product images: placeholders from `scripts/generate-seed-images.ts` or real photos? **Placeholders** (fast, license-safe). Swap files in `assets/seed-images/` later if you want prettier shots.

---

## Future: tests (do not implement now)

Highest value when the owner asks:

1. Concurrent `POST /v1/orders` on last-unit stock (oversell).
2. Stripe webhook idempotency (duplicate `checkout.session.completed`).
3. Refresh-token reuse detection (family revoke).
4. Order transition matrix (illegal PATCH status).
5. Demo protected-account mutations.
6. Webhook signature failure (400) vs raw-body success.
