import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  DISPATCH_EVENT_ID_HEADER,
  DISPATCH_SIGNATURE_HEADER,
  DispatchEventOutcome,
  OrderStatus,
  dispatchEventEnvelopeSchema,
  type DispatchEventReceiptDto,
} from '@topflow/shared';
import { createZodDto } from 'nestjs-zod';
import { Meta, Public } from '../common/decorators';
import type { AppRequest, RequestMeta } from '../common/request-context';
import { DispatchEventsService } from './dispatch-events.service';

/**
 * For the OpenAPI description only: what every event carries. The handler reads the raw bytes
 * itself, because the signature covers them, so this class never validates a request.
 */
class DispatchEventEnvelopeDto extends createZodDto(
  dispatchEventEnvelopeSchema,
) {}

/** The error envelope (common/openapi.ts) for the answers this operation documents itself. */
const apiError = (description: string) => ({
  description,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ApiError' },
    },
  },
});

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
  @ApiHeader({
    name: DISPATCH_SIGNATURE_HEADER,
    required: true,
    description:
      't=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>"> with the shared secret',
  })
  @ApiHeader({
    name: DISPATCH_EVENT_ID_HEADER,
    required: true,
    description: 'The event id, equal to id in the body',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ type: DispatchEventEnvelopeDto })
  // Declared here because an operation that documents any response gets no default 200.
  @ApiResponse({
    status: 200,
    description:
      'The event was recorded (APPLIED, IGNORED or PENDING), or its id was received before (DUPLICATE)',
    schema: {
      type: 'object',
      required: ['eventId', 'outcome', 'orderNumber', 'orderStatus'],
      properties: {
        eventId: { type: 'string', format: 'uuid' },
        outcome: {
          type: 'string',
          enum: [...Object.values(DispatchEventOutcome), 'DUPLICATE'],
        },
        orderNumber: { type: 'string', nullable: true },
        orderStatus: {
          type: 'string',
          nullable: true,
          enum: [...Object.values(OrderStatus), null],
          description:
            'The status of the order after a delivery.completed event; null for other events and for a duplicate',
        },
      },
    },
  })
  // @Public() leaves 401 out of the documented answers, but this operation has its own
  // authentication; and its 503 is an answer the sender acts on, not a server error.
  @ApiResponse({
    status: 401,
    ...apiError(
      'The signature is missing, malformed, outside the accepted time window or does not match the body',
    ),
  })
  @ApiResponse({
    status: 503,
    ...apiError(
      'The integration is switched off (DISPATCH_WEBHOOK_SECRET is not set): try again later',
    ),
  })
  receive(
    @Req() request: RawBodyRequest<AppRequest>,
    @Headers(DISPATCH_SIGNATURE_HEADER) signature: string | undefined,
    @Headers(DISPATCH_EVENT_ID_HEADER) eventId: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<DispatchEventReceiptDto> {
    return this.events.receive(request.rawBody, { signature, eventId }, meta);
  }
}
