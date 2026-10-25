# Testing and CI

**Unit tests (102, no database needed).** `npm test` runs Vitest with small hand-written fakes: the payment service (verification, webhook signature checks, subscriptions, the needs-review path and the admin alert), seat-hold rules, notifications, the three background jobs (payment sweep, subscription expiry, class reminders), health, cookies, env validation, CORS, class timing and privacy rules. None need a database, Redis, Paystack or Firebase.

**Real-Postgres tests (13).** `src/classes/classes.repository.integration.spec.ts` runs against an actual Postgres, because the seat claim relies on `SELECT ... FOR UPDATE`, which a fake database cannot prove. It fires many bookings at the same moment and counts the winners:

- 20 simultaneous bookings on a 5-seat class give exactly 5 holds (and the same race is repeated over several rounds), so a class can never be oversold.
- Confirmed members and active holds both count toward capacity; expired holds do not.
- A double-click gives one hold, a repeated webhook does not enrol twice, and the database itself rejects a duplicate enrolment.

These tests only run when `TEST_DATABASE_URL` is set; without it they are skipped, so plain `npm test` needs no database. They refuse to run against anything but a local database, so they cannot touch real data. To run them on your machine:

```bash
docker run -d --name gym-test-pg -e POSTGRES_USER=ci -e POSTGRES_PASSWORD=ci \
  -e POSTGRES_DB=gym_ontime_test -p 5433:5432 postgres:16

export DATABASE_URL=postgresql://ci:ci@localhost:5433/gym_ontime_test
export TEST_DATABASE_URL=$DATABASE_URL
npx prisma migrate deploy
npx vitest run src/classes/classes.repository.integration.spec.ts
```

**CI (GitHub Actions)** runs two workflows on every push and pull request to `master`. Render deploys the API only after both are green.

- `.github/workflows/ci.yml`: `npm ci`, Prisma generate, type-check, build, unit tests, and a Docker image build. It uses dummy values only; no real secrets.
- `.github/workflows/integration.yml`: starts a throwaway Postgres 16, applies the migrations to the empty database, runs the real-Postgres tests above, then builds and starts the API and smoke-tests it (health, register, log in, read your own profile, and a 401 without the cookie).

The push paths were verified manually against live services (including Redis outages and retry paths). A full register, log in, pay and enrol end-to-end test (which needs a Paystack stand-in) is on the [roadmap](../README.md#roadmap).

Convention: construct classes by hand with small fakes rather than Nest's `Test.createTestingModule` (Vitest does not emit the decorator metadata Nest DI needs).
