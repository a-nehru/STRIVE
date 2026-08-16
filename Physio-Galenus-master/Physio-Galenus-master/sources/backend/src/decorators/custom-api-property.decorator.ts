import { ApiProperty, ApiPropertyOptions } from '@nestjs/swagger';

export function CustomApiProperty(
  options?: ApiPropertyOptions,
): PropertyDecorator {
  return ApiProperty(options);
}
