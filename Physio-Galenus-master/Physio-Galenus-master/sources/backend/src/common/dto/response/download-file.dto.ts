import { Exclude, Expose } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class DownloadFileResponseDto {
  @Expose()
  @IsString()
  @IsOptional()
  @CustomApiProperty()
  readonly data: string;
}
