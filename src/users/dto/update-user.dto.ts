import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

// Equivalent of updateUserSchema (Zod). All fields optional since this is
// a partial update — only the fields the caller actually sends get
// validated/applied, same as the `...(data.name && {...})` spread pattern
// in the Express service.
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
