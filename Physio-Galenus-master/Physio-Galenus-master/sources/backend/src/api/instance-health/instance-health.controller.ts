import { instanceHealthEndpoint } from '@config/endpoints.config';
import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';

@Controller(instanceHealthEndpoint.$full)
export class InstanceHealthController {
  @Get()
  @HttpCode(HttpStatus.OK)
  health(): void {}
}
