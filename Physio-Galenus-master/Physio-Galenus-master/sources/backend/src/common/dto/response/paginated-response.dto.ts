import { IPaginationData } from '@common-interfaces/pagination.interface';
import { Exclude, Expose, Type } from 'class-transformer';
import { IsNumber, IsOptional } from 'class-validator';
import {
  ResponseDto,
  ResponseMetadata,
} from '@common-response-dto/response.dto';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class PaginatedResponseMetadata
  extends ResponseMetadata
  implements IPaginationData
{
  @Expose()
  @IsOptional()
  @IsNumber()
  @CustomApiProperty()
  totalCount: number;

  @Expose()
  @IsOptional()
  @IsNumber()
  @CustomApiProperty()
  count: number;

  @Expose()
  @IsOptional()
  @IsNumber()
  @CustomApiProperty()
  perPageCount: number;

  @Expose()
  @IsOptional()
  @IsNumber()
  @CustomApiProperty()
  page: number;

  @Expose()
  @IsOptional()
  @IsNumber()
  @CustomApiProperty()
  pages: number;

  @Expose()
  @IsOptional()
  @IsNumber()
  @CustomApiProperty()
  pageSize: number;
}

export abstract class PaginatedResponseDto extends ResponseDto {
  abstract data: any[];

  @Expose()
  @IsOptional()
  @Type(() => PaginatedResponseMetadata)
  @CustomApiProperty()
  metadata?: PaginatedResponseMetadata;
}
