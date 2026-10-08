import { IsOptional, IsUrl } from 'class-validator';

// Equivalent of the plain { avatar?: string } shape Express's
// updateMyAdminProfile takes — no Zod schema existed for this in Express
// either (req.body passed straight through), so this DTO is slightly
// stricter than the original by actually validating the URL shape.
export class UpdateAdminProfileDto {
  @IsOptional()
  @IsUrl()
  avatar?: string;
}
