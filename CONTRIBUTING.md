# Contributing

Thanks for taking an interest. This is a portfolio project, but it is run like a team project: changes go through a pull request and a green CI run.

## Set up

Prerequisites: Node.js 22, npm, a PostgreSQL database (a free Neon project is fine), and optionally Docker for Redis and Jaeger.

```bash
git clone https://github.com/Dev-Jabbar/gym_ontime_nestjs_backend.git
cd gym_ontime_nestjs_backend
npm install --legacy-peer-deps      # the flag is required: some peer ranges conflict
cp .env.example .env                # fill in your own values; never commit .env
npx prisma migrate deploy
npx prisma generate
docker compose up -d redis jaeger   # optional
npm run start:dev                   # http://localhost:3001/api
```

Use your own database, your own Paystack **test** key and your own Firebase/Cloudinary projects. Never use real customer data.

## Workflow

1. **Branch from `master`** (`feature/short-name` or `fix/short-name`). Do not push straight to `master`: a push to `master` deploys to production once CI is green.
2. Make a focused change. Add or update tests with it.
3. Run the checks below locally.
4. Open a pull request. The template lists what to confirm. Both GitHub Actions workflows (`CI` and `Integration (Postgres)`) must be green.
5. Merge. Render deploys automatically after CI passes.

Write commit messages in the imperative, one line, saying what changed and why it matters (`Alert admins when a payment needs review`, not `fixes`).

## Checks to run before opening a pull request

```bash
npx tsc -p tsconfig.build.json --noEmit   # type-check
npm run lint                              # oxlint
npm test                                  # unit tests (no database needed)
```

If you touched seat booking or SQL, also run the real-Postgres tests; see [docs/TESTING.md](docs/TESTING.md).

## Code conventions

- **Layering.** Controllers handle HTTP only. Services hold business rules and choose the HTTP exception. **Only `*.repository.ts` files import `PrismaService`.** Repositories return data, `null` or a result code and never throw HTTP exceptions. Modules call each other through services, never through another module's repository.
- **Validation.** Request bodies are `class-validator` DTOs; the global `ValidationPipe` uses `whitelist: true`.
- **ES modules.** Imports use the `.js` extension (`from './x.service.js'`). Use `import type` for types used in decorated parameters.
- **Route order.** Put fixed paths (`/me`, `/my-classes`, `verify`) before `/:id`.
- **Optional dependencies fail open.** Redis, Firebase and tracing must never break a request. Wrap them, log, carry on.
- **Swagger.** New controllers get `@ApiTags`, an `@ApiOperation` per route (with the allowed roles) and `@ApiCookieAuth()` before `@UseGuards(JwtAuthGuard, ...)`.
- **Response shape.** If the frontend reads an endpoint, check the response shape (`id` versus `_id`, populated objects versus strings), not just that the route exists. See [ADR 0006](docs/adr/0006-frontend-accepts-both-id-shapes.md).

## Tests

- Import `describe`, `it`, `expect` and `vi` from `vitest` explicitly.
- Construct classes by hand with small fakes. Do **not** use Nest's `Test.createTestingModule`: Vitest (esbuild) does not emit the decorator metadata Nest's DI needs.
- If a service gains a dependency, add it to the fakes in the existing specs (for example `notifyAdmins` on the notifications fake in `payments.service.spec.ts`).
- Anything that relies on database locking belongs in the real-Postgres spec, not in a fake-based unit test.

## Database changes

1. Edit `prisma/schema.prisma`.
2. `npx prisma migrate dev --name short_description` (use Neon's **direct** connection string, not the pooler).
3. Commit the generated folder under `prisma/migrations/`.
4. Before the change reaches `master`, apply it to production with `npx prisma migrate deploy`; migrations are a manual release step. See [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Dependencies and the lockfile

Add packages with `npm install <pkg> --legacy-peer-deps` and **commit `package-lock.json`**. `npm ci` (CI and the Docker build) fails when the lockfile is out of sync with `package.json`.

## Secrets

Never commit `.env`, `.env.k8s`, service-account JSON or real keys, and never paste them into issues, pull requests or chats. Secret scanning and push protection are on for this repository. In examples use obviously fake values such as `your-paystack-test-secret-key`.
