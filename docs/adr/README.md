# Architecture decision records

An ADR is a short note that captures one significant technical decision: the situation, what was chosen, what else was possible and what follows from it. They explain *why* the code looks the way it does, so a future reader (or the author in six months) does not have to guess or undo a decision by accident.

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](0001-row-locking-for-seat-holds.md) | Use row-level locking (`SELECT ... FOR UPDATE`) for seat holds | Accepted |
| [0002](0002-single-verify-payment-routine.md) | One idempotent `verifyPayment` routine for every payment outcome | Accepted |
| [0003](0003-webhook-signature-over-raw-body.md) | Verify the Paystack webhook over the raw request body | Accepted |
| [0004](0004-cache-aside-fails-open.md) | Cache-aside in repositories, and every optional dependency fails open | Accepted |
| [0005](0005-bullmq-repeatable-jobs.md) | BullMQ repeatable jobs on a separate Redis database instead of in-process cron | Accepted |
| [0006](0006-frontend-accepts-both-id-shapes.md) | The frontend accepts both id shapes; the API does not imitate MongoDB | Accepted |
| [0007](0007-single-instance-deployment.md) | Run a single instance, and document the path to several | Accepted |
| [0008](0008-health-semantics-and-probes.md) | Health semantics: `ok` / `degraded` / `error`, and TCP liveness | Accepted |

## Adding a record

1. Copy the structure of an existing file and take the next number (`0009-short-title.md`).
2. Write it while the decision is being made, in plain words: context, decision, options considered, consequences.
3. Add a row to the table above.
4. Never rewrite history. If a decision changes, add a new record and set the old one's status to `Superseded by ADR NNNN`.

For the system as a whole, see [`../ARCHITECTURE.md`](../ARCHITECTURE.md).
