import { IsEnum, IsUUID, ValidateIf } from 'class-validator';

// Request body for starting a checkout. `subscriptionInterval` is required
// (and validated at all) only when `paymentType` is "subscription".
// @ValidateIf makes class-validator skip every decorator on the property when
// the callback returns false, so a one-time payment without an interval passes.
//
// `classId` is validated as a UUID (Postgres primary keys). The allowed
// intervals (weekly, monthly, threeMonths) match the Prisma
// SubscriptionInterval enum and what PaymentsService enforces.
export class InitiatePaymentDto {
  @IsUUID()
  classId: string;

  @IsEnum(['one-time', 'subscription'])
  paymentType: 'one-time' | 'subscription';

  @ValidateIf((o) => o.paymentType === 'subscription')
  @IsEnum(['weekly', 'monthly', 'threeMonths'])
  subscriptionInterval?: 'weekly' | 'monthly' | 'threeMonths';
}
