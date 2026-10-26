import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

// Request body for a partial user update: every field is optional, and only
// the fields the caller sends are validated and applied.
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Name is required' })
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Please enter a valid email address' })
  email?: string;

  @IsOptional()
  @IsIn(['member', 'trainer', 'admin'], {
    message: 'Role must be member, trainer, or admin',
  })
  role?: 'member' | 'trainer' | 'admin';
}
