import type { OpenAPIObject } from '@nestjs/swagger';
import { API_ERROR_SCHEMA, documentErrorResponses } from './openapi';

const document = (): OpenAPIObject => ({
  openapi: '3.0.0',
  info: { title: 'Test', version: '1' },
  paths: {
    '/health': { get: { responses: { '200': { description: 'Up' } } } },
    '/me/orders': {
      get: { responses: { '200': { description: 'Orders' } } },
      post: {
        responses: {
          '201': { description: 'Created' },
          default: { description: 'Documented by hand' },
        },
      },
    },
  },
  components: { schemas: { OrderDto: { type: 'object' } } },
});

describe('documentErrorResponses', () => {
  it('documents the error envelope as the default response of every operation', () => {
    const result = documentErrorResponses(document());
    for (const operation of [
      result.paths['/health'].get,
      result.paths['/me/orders'].get,
    ]) {
      expect(operation?.responses).toMatchObject({
        '200': expect.any(Object),
        default: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApiError' },
            },
          },
        },
      });
    }
    expect(result.components?.schemas).toEqual({
      OrderDto: { type: 'object' },
      ApiError: API_ERROR_SCHEMA,
    });
  });

  it('keeps a default response that an operation documents itself', () => {
    const result = documentErrorResponses(document());
    expect(result.paths['/me/orders'].post?.responses.default).toEqual({
      description: 'Documented by hand',
    });
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

  it('leaves the input document unchanged', () => {
    const input = document();
    documentErrorResponses(input);
    expect(input).toEqual(document());
  });
});
