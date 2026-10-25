# Security policy

## Supported versions

Only the latest commit on `master` (the version deployed to production) receives security fixes.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Report it privately through GitHub: **Security tab, "Report a vulnerability"** (private security advisory) on this repository:
https://github.com/Dev-Jabbar/gym_ontime_nestjs_backend/security/advisories/new

Include what you found, how to reproduce it, and the impact you expect. Please do not access other people's data, run load or denial-of-service tests against the live demo, or test with real payment details.

This is a personal project, so there is no formal response-time guarantee; reports are read and answered as soon as possible.

## What is in place

- Secrets come from environment variables only. `.env` is git-ignored, and GitHub secret scanning and push protection are enabled on this repository. CI and the Docker image contain no real secrets.
- The app refuses to start in production with a weak `JWT_SECRET` or a missing required setting.
- `helmet` sets standard security headers; login and register are rate limited per client IP.
- Request bodies are validated and whitelisted by DTOs.
- Paystack webhooks are authenticated with a constant-time HMAC-SHA512 comparison over the raw body.
- Cloudinary uploads are signed server-side with a secret the browser never sees.
- Personal data is minimised: member profiles are visible only to admins, trainers and the member; trainer phone numbers need a login and dates of birth are admin-only.
- Seat claims are serialized with row-level locks.

## Known gaps

These are documented rather than hidden:

- The login/register rate limiter is in memory, so it is per instance (the API runs as a single instance on purpose; see [ADR 0007](docs/adr/0007-single-instance-deployment.md)).
- Safari and other browsers that block third-party cookies may not keep the cross-site production session cookie.
- `PUT /api/users/:id` does not reissue the JWT when the role or email changes.

## For contributors and operators

- Real secrets live only in the host's environment settings (Render) and your local `.env`.
- Generate a strong `JWT_SECRET`: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
- If a secret is exposed (screenshot, paste, commit), treat it as compromised: rotate it at the provider and redeploy.
