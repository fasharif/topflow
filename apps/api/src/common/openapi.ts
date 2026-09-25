import type {
  OpenAPIObject,
  OperationObject,
  PathItemObject,
  SchemaObject,
} from '@nestjs/swagger';

/** JSON schema of ApiErrorBody (@topflow/shared): the body HttpExceptionFilter returns for every failure. */
export const API_ERROR_SCHEMA: SchemaObject = {
  type: 'object',
  required: ['statusCode', 'error', 'message'],
  properties: {
    statusCode: { type: 'integer', example: 400 },
    error: { type: 'string', example: 'Bad Request' },
    message: { type: 'string', example: 'Enter a valid email address' },
    code: {
      type: 'string',
      description:
        'Machine-readable reason (ErrorCode), when the client can act on it',
      example: 'MFA_REQUIRED',
    },
    details: {
      type: 'array',
      description: 'Field-level validation messages',
      items: {
        type: 'object',
        required: ['path', 'message'],
        properties: {
          path: { type: 'string', example: 'items.0.quantity' },
          message: { type: 'string' },
        },
      },
    },
    requestId: {
      type: 'string',
      description: 'Also sent as the x-request-id header',
    },
  },
};

const METHODS = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
] as const satisfies ReadonlyArray<keyof PathItemObject>;

/**
 * Documents the error envelope as the `default` response of every operation. Controllers declare
 * only their success response, so without this the published description claimed each operation
 * answers with that one status, and clients or contract tests could not rely on the 400, 401,
 * 403, 404, 409 and 429 bodies the API returns. Existing `default` responses are kept.
 */
export function documentErrorResponses(document: OpenAPIObject): OpenAPIObject {
  const errorResponse = {
    description:
      'Error: validation (400), authentication (401), permission or MFA (403), not found (404), conflict with the current state (409), rate limit (429) or server error (5xx)',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ApiError' },
      },
    },
  };
  const paths = Object.fromEntries(
    Object.entries(document.paths).map(([path, item]) => {
      const documented: PathItemObject = { ...item };
      for (const method of METHODS) {
        const operation: OperationObject | undefined = item[method];
        if (operation) {
          documented[method] = {
            ...operation,
            responses: { default: errorResponse, ...operation.responses },
          };
        }
      }
      return [path, documented];
    }),
  );
  return {
    ...document,
    paths,
    components: {
      ...document.components,
      schemas: { ...document.components?.schemas, ApiError: API_ERROR_SCHEMA },
    },
  };
}
