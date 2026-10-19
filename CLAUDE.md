# shopcore

E-commerce REST API: NestJS 12, Prisma 7, PostgreSQL 18, Redis 8, Stripe test Checkout, Cloudflare R2, Swagger. Public portfolio demo for foreign Fiverr/Upwork clients.

Implement **[docs/PLAN.md](docs/PLAN.md) phase by phase**. Tick each `- [ ]` when done. Run that phase's **Verification** before starting the next. Product/endpoints: [docs/SPEC.md](docs/SPEC.md). How: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). If they conflict, SPEC wins for behaviour, ARCHITECTURE for files/stack.

## Commands

```
pnpm install
docker compose up -d postgres redis
pnpm db:generate && pnpm db:migrate && pnpm db:seed
pnpm dev                 # http://localhost:3000/docs
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build
pnpm stripe:listen       # webhook forwarding
```

Node 24 LTS. pnpm 12.11.2. Prisma **7.10.0** exact pin — never install `prisma@latest` (that dist-tag may be 8 RC).

## Conventions

- Feature modules, one-way deps (ARCHITECTURE §4.2). Controllers thin; services talk to Prisma; mappers are pure. No barrel `index.ts`. Relative imports end in `.js`.
- Money: integer minor units + `USD`. IDs: UUID v7. Errors: RFC 9457 `application/problem+json` from SPEC §9.
- Validation: Zod 4 schemas on `@Body/@Query/@Param({ schema })`. Strict bodies.
- Auth: Bearer access JWT (15 min) + rotating hashed refresh in JSON body. Custom guards, not Passport.
- Stripe test keys only (`sk_test_` / `rk_test_`). Webhook uses `req.rawBody`.
- Demo seed accounts are `isProtected`. Nightly reset at 03:00 UTC.

## Do not

- Do not write tests unless the owner explicitly asks.
- Code comments in English only, and only when they explain a constraint the code cannot show.
- Do not commit `.env` or secrets. Keep `.env.example` up to date.
- Do not add dependencies not listed in docs/ARCHITECTURE.md without a PLAN.md Decisions log entry.
- Never add Co-authored-by / "Made with Cursor" or similar AI trailers to commits.
- Do not boot with live Stripe keys. Do not return Prisma objects from controllers.
- Do not import `PaymentsModule` from `OrdersModule` (Orders talks to Stripe directly for expire/retrieve).
