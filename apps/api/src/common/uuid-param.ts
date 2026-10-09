import { Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiParam, type ApiHeaderOptions } from '@nestjs/swagger';
import { ORGANIZATION_HEADER } from '@topflow/shared';

/**
 * The tenant header of the trade-portal routes, as published in the OpenAPI description. The
 * organisation guard refuses a missing or malformed value with 400, so the description says it is
 * a UUID.
 */
export const ORGANIZATION_HEADER_DOC = {
  name: ORGANIZATION_HEADER,
  required: true,
  description: 'Organization (tenant) to act in, by id',
  schema: { type: 'string', format: 'uuid' },
} satisfies ApiHeaderOptions;

/**
 * A path parameter that must be a UUID. It is validated with ParseUUIDPipe (400 otherwise) and
 * published in the OpenAPI description as `format: uuid`, so clients and contract tests know the
 * rule instead of discovering it from a 400.
 */
export function UuidParam(name: string): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    Param(name, ParseUUIDPipe)(target, propertyKey, parameterIndex);
    // @ApiParam keeps its metadata on the handler function, which the descriptor holds.
    const descriptor =
      propertyKey === undefined
        ? undefined
        : Object.getOwnPropertyDescriptor(target, propertyKey);
    if (propertyKey !== undefined && descriptor) {
      ApiParam({ name, type: String, format: 'uuid', required: true })(
        target,
        propertyKey,
        descriptor,
      );
    }
  };
}
