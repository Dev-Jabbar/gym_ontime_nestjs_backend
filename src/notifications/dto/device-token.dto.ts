import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterDeviceTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  token: string;

  @IsOptional()
  @IsIn(['web', 'android', 'ios'])
  platform?: 'web' | 'android' | 'ios';
}

export class UnregisterDeviceTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  token: string;
}
