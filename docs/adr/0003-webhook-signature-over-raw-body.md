# ADR 0003: Verify the Paystack webhook over the raw request body

- **Status:** Accepted
- **Scope:** NestJS backend

## Context

Paystack signs the exact bytes it sends with HMAC-SHA512. Recomputing the signature over `JSON.stringify(req.body)` (the first implementation) can differ from those bytes in whitespace or key order and reject genuine events.

## Decision

The app is created with `rawBody: true`. `PaymentsController.webhook` passes the raw `Buffer` and the `x-paystack-signature` header to `PaymentsService.handlePaystackWebhook`, which computes the HMAC with `PAYSTACK_SECRET_KEY` and compares with `crypto.timingSafeEqual` (length checked first). A missing header gives 401 `No signature provided`, an empty body 400, a wrong signature 401 `Invalid signature`. Only then does the `charge.success` logic run, and it still re-verifies the charge with Paystack through [ADR 0002](0002-single-verify-payment-routine.md).

## Options considered

- **Alternative: trust the parsed body and skip the signature.** Rejected: the endpoint is public, so anyone could forge a payment.
- **Alternative: plain string comparison.** Rejected: not constant-time.

## Consequences

- Genuine events are accepted; tampered, mis-sized or unsigned requests are rejected (covered by unit tests).
- The webhook route is the one controller that reads the raw request instead of a DTO.
- Verified live with a signed Postman request, and the production webhook URL is configured in the Paystack dashboard.
