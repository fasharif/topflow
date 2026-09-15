import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { WebsiteQuoteReceiptDto } from '@topflow/shared';
import { Meta, Public } from '../common/decorators';
import type { RequestMeta } from '../common/request-context';
import { strictThrottle } from '../common/throttle';
import { CreateWebsiteQuoteRequestDto } from './procurement.dto';
import { RfqService } from './rfq.service';

@ApiTags('Website · Quote requests')
@Controller('quote-requests')
export class WebsiteQuoteRequestsController {
  constructor(private readonly rfqs: RfqService) {}

  @Public()
  @Throttle(strictThrottle)
  @Post()
  @ApiOperation({
    summary: 'Ask for a quotation from the public website (no account needed)',
  })
  create(
    @Body() dto: CreateWebsiteQuoteRequestDto,
    @Meta() meta: RequestMeta,
  ): Promise<WebsiteQuoteReceiptDto> {
    return this.rfqs.createFromWebsite(dto, meta);
  }
}
