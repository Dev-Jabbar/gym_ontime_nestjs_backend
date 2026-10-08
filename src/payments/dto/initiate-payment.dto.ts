import { IsEnum, IsUUID, ValidateIf } from 'class-validator';

// Equivalent of initiatePaymentSchema (Zod), including the conditional
// requirement Express expressed with .refine(): subscriptionInterval is
// only required (and only validated at all) when paymentType is
// "subscription". @ValidateIf reproduces that exactly — class-validator
// skips every decorator below it on this property when the callback
// returns false, so a one-time payment with no subscriptionInterval at
// all passes cleanly, same as Express.
//
// classId is validated as a UUID, not the 24-char Mongo ObjectId regex
// Express's objectIdSchema used — a necessary adaptation to the platform
// change (Postgres UUID primary keys, established since Step 1.5's
// ParseUUIDPipe), not a stylistic deviation.
//
// The interval enum here is the real, live one used throughout this
// codebase (weekly/monthly/threeMonths) — matching what
// payment.service.ts and the Prisma schema's SubscriptionInterval enum
// both actually enforce, NOT the unused 5-tier enum found in Express's
// orphaned subscription.util.ts (quarterly/biannual/yearly), which is
// dead code, never imported anywhere, and was not ported.
export class InitiatePaymentDto {
  @IsUUID()
  classId: string;

  @IsEnum(['one-time', 'subscription'])
  paymentType: 'one-time' | 'subscription';

  @ValidateIf((o) => o.paymentType === 'subscription')
  @IsEnum(['weekly', 'monthly', 'threeMonths'])
  subscriptionInterval?: 'weekly' | 'monthly' | 'threeMonths';
}
