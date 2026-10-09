import type {
  OpenAPIObject,
  OperationObject,
  PathItemObject,
  SchemaObject,
} from '@nestjs/swagger';
import { ErrorCode } from '@topflow/shared';

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
      enum: Object.values(ErrorCode),
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
 * Vendor extension that @Public() puts on an operation. documentErrorResponses reads it to leave
 * out the authentication answers, and removes it again.
 */
export const PUBLIC_OPERATION = 'x-topflow-public';

const MUTATIONS = new Set(['put', 'post', 'delete', 'patch']);

/** What each documented error status means, for the response descriptions. */
const ERROR_STATUSES: Record<string, string> = {
  '400': 'Invalid request: validation failed (details lists the fields)',
  '401': 'Authentication required, or the access token is invalid or expired',
  '403':
    'Not allowed: missing permission, second factor, or organisation membership',
  '404': 'Not found, or not visible to the caller',
  '409':
    'Conflict with the current state (for example stock, a duplicate or a finished workflow). With the code CONCURRENT_UPDATE, another request changed the record first and nothing was written: load it again before deciding',
  '422': 'Well-formed, but breaks a business rule',
  '429': 'Too many requests: rate limit reached',
  '5XX': 'Server error',
};

/**
 * The error statuses an operation can answer, from how the API is built: the global validation
 * pipe (400) for any input, the authentication and permission guards (401, 403) unless the route
 * is public, a lookup by id (404) for path parameters and writes, the state and business checks of
 * writes (409, 422), and the global rate limit (429). Anything else is a server error.
 */
export function errorStatusesFor(
  method: string,
  operation: OperationObject,
  isPublic: boolean,
): string[] {
  const parameters = (operation.parameters ?? []) as Array<{ in?: string }>;
  const hasPathParameter = parameters.some((p) => p.in === 'path');
  const hasInput = parameters.length > 0 || operation.requestBody !== undefined;
  const writes = MUTATIONS.has(method);
  return [
    ...(hasInput ? ['400'] : []),
    ...(isPublic ? [] : ['401', '403']),
    ...(hasPathParameter || writes ? ['404'] : []),
    ...(writes ? ['409', '422'] : []),
    '429',
    '5XX',
  ];
}

/**
 * Documents the error envelope for the statuses each operation can answer. Controllers declare
 * only their success response, so without this the published description claimed each operation
 * answers with that one status, and clients or contract tests could not rely on the error bodies.
 * The statuses are listed one by one (errorStatusesFor) rather than as `default`, so a contract
 * test still notices an answer the API was not built to give. Operations that are not public also
 * get the bearer security requirement, which some controllers did not declare. Responses an
 * operation documents itself are kept.
 */
export function documentErrorResponses(document: OpenAPIObject): OpenAPIObject {
  const errorResponse = (status: string) => ({
    description: ERROR_STATUSES[status],
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ApiError' },
      },
    },
  });
  const paths = Object.fromEntries(
    Object.entries(document.paths).map(([path, item]) => {
      const documented: PathItemObject = { ...item };
      for (const method of METHODS) {
        const operation: OperationObject | undefined = item[method];
        if (operation) {
          const {
            [PUBLIC_OPERATION]: publicFlag,
            security,
            ...rest
          } = operation as OperationObject & { [PUBLIC_OPERATION]?: boolean };
          const isPublic = publicFlag === true;
          const errors = Object.fromEntries(
            errorStatusesFor(method, operation, isPublic).map((status) => [
              status,
              errorResponse(status),
            ]),
          );
          documented[method] = {
            ...rest,
            ...(isPublic ? {} : { security: security ?? [{ bearer: [] }] }),
            responses: { ...errors, ...operation.responses },
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
