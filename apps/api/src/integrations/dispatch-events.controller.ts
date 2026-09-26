import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  DISPATCH_EVENT_ID_HEADER,
  DISPATCH_SIGNATURE_HEADER,
  type DispatchEventReceiptDto,
} from '@topflow/shared';
import { Meta, Public } from '../common/decorators';
import type { AppRequest, RequestMeta } from '../common/request-context';
import { DispatchEventsService } from './dispatch-events.service';

@ApiTags('Integrations')
@Controller('integrations/dispatch')
export class DispatchEventsController {
  constructor(private readonly events: DispatchEventsService) {}

  /**
   * Called by the dispatch service, not by people: no Supabase token, but every request must
   * carry a valid HMAC signature over its exact bytes (hence the raw body).
   */
  @Public()
  @Post('events')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Signed delivery events from the dispatch service; delivery.completed marks a dispatched order delivered',
  })
  @ApiHeader({ name: DISPATCH_SIGNATURE_HEADER, required: true })
  @ApiHeader({ name: DISPATCH_EVENT_ID_HEADER, required: true })
  receive(
    @Req() request: RawBodyRequest<AppRequest>,
    @Headers(DISPATCH_SIGNATURE_HEADER) signature: string | undefined,
    @Headers(DISPATCH_EVENT_ID_HEADER) eventId: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<DispatchEventReceiptDto> {
    return this.events.receive(request.rawBody, { signature, eventId }, meta);
  }
}
