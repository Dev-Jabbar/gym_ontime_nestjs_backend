# ADR 0002: One idempotent `verifyPayment` routine for every payment outcome

- **Status:** Accepted
- **Scope:** NestJS backend

## Context

Paystack can tell the system about a payment in three ways: the member's browser returning from checkout (`GET /payments/verify`), the `charge.success` webhook, and the background sweep for payments left `pending`. In the Express version the webhook handler had grown its own copy of the seat-claiming logic and drifted out of sync (it was missing subscription creation).

## Decision

All three paths call `PaymentsService.verifyPayment(reference)`, which re-checks the charge with Paystack and then reaches one of a few outcomes: completed and enrolled, failed (hold released), or charged but the seat is gone (`needsReview`, the member is notified and every active admin is alerted). The routine is idempotent: a payment already `completed` is skipped, so repeated webhooks, double redirects and sweep runs are safe.

## Options considered

- **Alternative: webhook as the only trigger.** Rejected: Paystack only sends events for successful charges, so failures and abandoned checkouts would stay `pending` forever.
- **Alternative: separate logic per trigger.** Rejected: it already failed once in Express.

## Consequences

- One place to read, test and fix the payment rules; the paths cannot disagree by construction.
- The sweep is a safety net for closed browser tabs and missed webhooks, not a second implementation.
- Known gap: a `needsReview` payment still answers `success: true` from `verify`, so the frontend shows green (listed under Known limitations in the README).
