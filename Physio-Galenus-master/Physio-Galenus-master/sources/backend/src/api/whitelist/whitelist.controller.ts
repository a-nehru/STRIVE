import { Controller, Put, Query, UseGuards, UsePipes } from '@nestjs/common';
import { whitelistEndpoint } from '@config/endpoints.config';
import { AddUsernameToWhitelistDto } from 'src/common/dto/request/add-username-to-whitelist.dto';
import { ApiKeyGuard } from 'src/guards/api-key.guard';
import { CustomValidationPipe } from 'src/pipes/custom-validation.pipe';
import { WhitelistService } from './whitelist.service';

@UseGuards(ApiKeyGuard)
@Controller(whitelistEndpoint.$full)
export class WhitelistController {
  constructor(private readonly whitelistService: WhitelistService) {}

  @UsePipes(CustomValidationPipe)
  @Put()
  async addUsernameToWhitelist(
    @Query() query: AddUsernameToWhitelistDto,
  ): Promise<boolean> {
    return await this.whitelistService.addUsernameToWhitelist(query);
  }
}
