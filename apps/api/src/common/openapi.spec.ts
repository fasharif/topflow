import type { OpenAPIObject, OperationObject } from '@nestjs/swagger';
import { ErrorCode } from '@topflow/shared';
import {
  API_ERROR_SCHEMA,
  PUBLIC_OPERATION,
  documentErrorResponses,
  errorStatusesFor,
} from './openapi';

const document = (): OpenAPIObject => ({
  openapi: '3.0.0',
  info: { title: 'Test', version: '1' },
  paths: {
    '/health': {
      // @Public() adds this extension; OperationObject does not list vendor extensions.
      get: {
        [PUBLIC_OPERATION]: true,
        responses: { '200': { description: 'Up' } },
      } as OperationObject,
    },
    '/me/orders': {
      get: {
        parameters: [{ in: 'query', name: 'page' }],
        responses: { '200': { description: 'Orders' } },
      },
      post: {
        requestBody: { content: {} },
        security: [{ bearer: [] }],
        responses: {
          '201': { description: 'Created' },
          '409': { description: 'Documented by hand' },
        },
      },
    },
    '/me/orders/{id}': {
      get: {
        parameters: [{ in: 'path', name: 'id', required: true }],
        responses: { '200': { description: 'Order' } },
      },
    },
  },
  components: { schemas: { OrderDto: { type: 'object' } } },
});

const statuses = (responses: object | undefined) =>
  Object.keys(responses ?? {}).sort();

describe('errorStatusesFor', () => {
  it.each`
    case                                         | method      | operation                             | isPublic | expected
    ${'public read without input'}               | ${'get'}    | ${{ responses: {} }}                  | ${true}  | ${['429', '5XX']}
    ${'public write (website quote request)'}    | ${'post'}   | ${{ requestBody: {}, responses: {} }} | ${true}  | ${['400', '404', '409', '422', '429', '5XX']}
    ${'signed-in list with query parameters'}    | ${'get'}    | ${{ parameters: [{ in: 'query' }] }}  | ${false} | ${['400', '401', '403', '429', '5XX']}
    ${'signed-in read by id'}                    | ${'get'}    | ${{ parameters: [{ in: 'path' }] }}   | ${false} | ${['400', '401', '403', '404', '429', '5XX']}
    ${'signed-in read without input (/auth/me)'} | ${'get'}    | ${{ responses: {} }}                  | ${false} | ${['401', '403', '429', '5XX']}
    ${'signed-in delete by id'}                  | ${'delete'} | ${{ parameters: [{ in: 'path' }] }}   | ${false} | ${['400', '401', '403', '404', '409', '422', '429', '5XX']}
  `('$case', ({ method, operation, isPublic, expected }) => {
    expect(errorStatusesFor(method, operation, isPublic)).toEqual(expected);
  });
});

describe('documentErrorResponses', () => {
  it('documents the error envelope for each status the operation can answer, and no default', () => {
    const result = documentErrorResponses(document());
    expect(statuses(result.paths['/health'].get?.responses)).toEqual([
      '200',
      '429',
      '5XX',
    ]);
    expect(statuses(result.paths['/me/orders/{id}'].get?.responses)).toEqual([
      '200',
      '400',
      '401',
      '403',
      '404',
      '429',
      '5XX',
    ]);
    const order = result.paths['/me/orders/{id}'].get?.responses ?? {};
    expect(order['404']).toEqual({
      description: 'Not found, or not visible to the caller',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ApiError' },
        },
      },
    });
    expect(order).not.toHaveProperty('default');
    expect(result.components?.schemas).toEqual({
      OrderDto: { type: 'object' },
      ApiError: API_ERROR_SCHEMA,
    });
  });

  it('keeps a response that an operation documents itself', () => {
    const result = documentErrorResponses(document());
    expect(result.paths['/me/orders'].post?.responses['409']).toEqual({
      description: 'Documented by hand',
    });
  });

  it('requires the bearer token on every operation that is not public, and removes the marker', () => {
    const result = documentErrorResponses(document());
    expect(result.paths['/me/orders'].get?.security).toEqual([{ bearer: [] }]);
    expect(result.paths['/me/orders'].post?.security).toEqual([{ bearer: [] }]);
    expect(result.paths['/health'].get).not.toHaveProperty('security');
    expect(result.paths['/health'].get).not.toHaveProperty(PUBLIC_OPERATION);
  });

  it('describes the envelope HttpExceptionFilter returns', () => {
    expect(API_ERROR_SCHEMA.required).toEqual([
      'statusCode',
      'error',
      'message',
    ]);
    expect(Object.keys(API_ERROR_SCHEMA.properties ?? {})).toEqual([
      'statusCode',
      'error',
      'message',
      'code',
      'details',
      'requestId',
    ]);
  });

  it('lists the error codes, and says how a write that lost a race is answered', () => {
    expect(API_ERROR_SCHEMA.properties?.code).toMatchObject({
      type: 'string',
      enum: Object.values(ErrorCode),
    });
    const input = document();
    input.paths['/me/orders/{id}/cancel'] = {
      post: {
        parameters: [{ in: 'path', name: 'id', required: true }],
        responses: { '200': { description: 'Cancelled' } },
      },
    };
    const cancel =
      documentErrorResponses(input).paths['/me/orders/{id}/cancel'].post
        ?.responses ?? {};
    expect(cancel['409']).toMatchObject({
      description: expect.stringContaining(ErrorCode.CONCURRENT_UPDATE),
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ApiError' },
        },
      },
    });
  });

  it('leaves the input document unchanged', () => {
    const input = document();
    documentErrorResponses(input);
    expect(input).toEqual(document());
  });
});
