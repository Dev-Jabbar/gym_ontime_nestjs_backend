import { IsOptional, IsUrl } from 'class-validator';

// Body for updating the admin profile: an optional avatar URL. The URL shape
// is validated.
export class UpdateAdminProfileDto {
  @IsOptional()
  @IsUrl()
  avatar?: string;
}
