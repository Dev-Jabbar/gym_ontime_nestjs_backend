import { IsEmail, IsString, MinLength } from 'class-validator';

// Request body for registration. Validation rules are class-validator
// decorators on the fields; the global ValidationPipe (see bootstrap.ts) runs
// them before the DTO reaches the controller.
export class RegisterDto {
  @IsString()
  @MinLength(1, { message: 'Name is required' })
  name: string;

  @IsEmail({}, { message: 'Please enter a valid email address' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string;
}
