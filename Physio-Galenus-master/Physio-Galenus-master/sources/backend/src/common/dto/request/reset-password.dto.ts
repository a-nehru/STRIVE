import { Exclude, Expose } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class ResetPasswordDto {
  @Expose()
  @IsEmail()
  @IsNotEmpty()
  @CustomApiProperty()
  readonly username: string;

  @Expose()
  @IsString()
  @IsNotEmpty()
  @CustomApiProperty()
  readonly currentPassword: string;

  @Expose()
  @IsString()
  @IsNotEmpty()
  @CustomApiProperty()
  readonly newPassword: string;
}
