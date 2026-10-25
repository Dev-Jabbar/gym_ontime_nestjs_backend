# ADR 0006: The frontend accepts both id shapes; the API does not imitate MongoDB

- **Status:** Accepted
- **Scope:** NestJS backend

## Context

The same Next.js frontend must work with both backends. Mongoose returns `_id`; Prisma returns `id`. Early on, screens broke on Nest (for example the trainer dropdown sent `undefined` as the trainer and the API replied `trainer must be a UUID`), and the Nest payments and notifications responses carried extra `_id` aliases to compensate.

## Decision

The frontend reads ids through one helper, `idOf(entity)` = `entity._id ?? entity.id`, and the Nest API sends plain `id`. The `_id` aliases were removed from the payments and notifications responses. A few Mongo-shaped shims remain on purpose because the frontend depends on them: notification `relatedClass` / `relatedPayment`, payment type `one-time` (stored as `one_time`) and a numeric `amount`.

## Options considered

- **Alternative: make Nest return `_id` everywhere.** Rejected: it spreads a MongoDB convention through a PostgreSQL codebase for ever.
- **Alternative: two frontends or an adapter layer.** Rejected: more code for the same effect.

## Consequences

- Both backends keep working with one frontend, and the API shape is clean.
- Lesson recorded: when adding an endpoint the frontend reads, check the response **shape**, not only that the route exists, and test each screen once per backend.
- Rollout order matters for changes of this kind: frontend first, test both backends, backend last. A rollback of the backend is a plain `git revert`.
