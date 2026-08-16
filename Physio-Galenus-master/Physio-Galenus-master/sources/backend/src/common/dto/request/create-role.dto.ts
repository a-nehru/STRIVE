import { Exclude, Expose } from 'class-transformer';
import { IsNotEmpty, IsString, IsUppercase, MaxLength } from 'class-validator';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class CreateRoleDto {
  @Expose()
  @IsString()
  @IsUppercase()
  @IsNotEmpty()
  @CustomApiProperty()
  readonly id: string;

  @Expose()
  @IsString()
  @MaxLength(100)
  @IsNotEmpty()
  @CustomApiProperty()
  readonly name: string;

  @Expose()
  @IsString()
  @MaxLength(255)
  @IsNotEmpty()
  @CustomApiProperty()
  readonly description: string;
}
