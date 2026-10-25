## What and why

<!-- One or two sentences: what changes, and why it is needed. Link the issue if there is one. -->

## How it was checked

- [ ] `npx tsc -p tsconfig.build.json --noEmit` is clean
- [ ] `npm run lint` is clean
- [ ] `npm test` passes (and the real-Postgres tests, if I touched seats or SQL)
- [ ] I tried it by hand (describe how below)

## Release notes

- [ ] Includes a Prisma migration (to be applied with `prisma migrate deploy` **before** merging)
- [ ] Adds or changes an environment variable (updated `.env.example` and `docs/CONFIGURATION.md`)
- [ ] Changes a response shape the frontend reads (checked both backends through the picker)
- [ ] Adds or changes a route (Swagger decorators and `docs/API.md` updated)
- [ ] `package-lock.json` is committed and in sync

## Security

- [ ] No secrets, tokens or real personal data in the diff, logs or screenshots
