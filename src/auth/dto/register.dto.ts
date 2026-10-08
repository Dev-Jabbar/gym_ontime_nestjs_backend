import { IsEmail, IsString, MinLength } from 'class-validator';

// This is the direct equivalent of your registerUserSchema (Zod), just a
// different library's syntax: instead of chaining z.string().min(1)...,
// class-validator uses decorators ON the fields of an actual class.
// A global ValidationPipe (wired in main.ts) runs these checks automatically
// before this DTO ever reaches your controller method — same "reject bad
// input before it touches business logic" idea as loginUserSchema.parse()
// in your Express controller, just triggered by Nest's pipeline instead of
// a manual .parse() call you write yourself.
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
