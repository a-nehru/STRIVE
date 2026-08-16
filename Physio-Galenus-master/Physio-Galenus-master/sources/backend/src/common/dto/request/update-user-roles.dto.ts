import { Exclude, Expose } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class UpdateUserRolesDto {
  @Expose()
  @IsString({ each: true })
  @IsNotEmpty()
  @CustomApiProperty()
  readonly ids: string[];
}
