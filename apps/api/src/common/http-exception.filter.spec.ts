import { ArgumentsHost, NotFoundException } from '@nestjs/common';
import { Prisma } from '@topflow/database';
import { InvalidTransitionError } from '@topflow/shared';
import { ZodValidationException } from 'nestjs-zod';
import { z } from 'zod';
import { initErrorReporting } from '../observability/sentry';
import { HttpExceptionFilter } from './http-exception.filter';

function run(exception: unknown) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({
        requestId: 'req-42',
        method: 'GET',
        originalUrl: '/test?search=secret',
        path: '/test',
      }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  new HttpExceptionFilter().catch(exception, host);
  return {
    status: status.mock.calls[0][0] as number,
    body: json.mock.calls[0][0],
  };
}

describe('HttpExceptionFilter', () => {
  it('turns Zod validation failures into 400s with field details', () => {
    const result = z
      .object({ email: z.email({ error: 'Enter a valid email address' }) })
      .safeParse({ email: 'nope' });
    const { status, body } = run(new ZodValidationException(result.error));
    expect(status).toBe(400);
    expect(body).toMatchObject({
      message: 'Enter a valid email address',
      details: [{ path: 'email' }],
      requestId: 'req-42',
    });
  });

  it('preserves HTTP exceptions', () => {
    expect(run(new NotFoundException('Order not found'))).toMatchObject({
      status: 404,
      body: { error: 'Not Found', message: 'Order not found' },
    });
  });

  it('maps illegal workflow transitions to 409', () => {
    expect(
      run(new InvalidTransitionError('order', 'DELIVERED', 'CANCELLED')).status,
    ).toBe(409);
  });

  it('maps unique constraint violations to 409 without leaking SQL', () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`sku`)',
      {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['sku'] },
      },
    );
    expect(run(error)).toMatchObject({
      status: 409,
      body: { message: 'A record with this sku already exists' },
    });
  });

  it('reports server errors to Sentry when it is configured, and nothing else', () => {
    const sdk = { init: jest.fn(), captureException: jest.fn() };
    initErrorReporting(
      { SENTRY_DSN: 'https://key@o1.ingest.sentry.io/1' },
      sdk,
    );
    try {
      run(new NotFoundException('Order not found'));
      expect(sdk.captureException).not.toHaveBeenCalled();

      const crash = new Error('connection refused');
      run(crash);
      expect(sdk.captureException).toHaveBeenCalledWith(crash, {
        tags: { requestId: 'req-42' },
        extra: { method: 'GET', path: '/test' },
      });
    } finally {
      initErrorReporting({});
    }
  });

  it('keeps the 4xx status of a request the body parser refused', () => {
    // What body-parser raises (through http-errors) for a body over the limit.
    const tooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
      statusCode: 413,
      expose: true,
      type: 'entity.too.large',
    });
    expect(run(tooLarge)).toMatchObject({
      status: 413,
      body: {
        statusCode: 413,
        error: 'Payload Too Large',
        message: 'Request entity too large',
      },
    });
    const encoding = Object.assign(
      new Error('unsupported content encoding "bogus"'),
      { status: 415, expose: true, type: 'encoding.unsupported' },
    );
    expect(run(encoding)).toMatchObject({
      status: 415,
      body: { error: 'Unsupported Media Type' },
    });
  });

  it('does not take a status from an error that is not marked for the client', () => {
    // http-errors sets expose only on 4xx; a 5xx, or a status on some other error, stays a 500.
    for (const error of [
      Object.assign(new Error('stream encoding should not be set'), {
        status: 500,
        expose: false,
      }),
      Object.assign(new Error('upstream said no'), { status: 404 }),
      Object.assign(new Error('odd'), { status: 200, expose: true }),
    ]) {
      const { status, body } = run(error);
      expect(status).toBe(500);
      expect(body.message).toBe(
        'Something went wrong. Please try again later.',
      );
    }
  });

  it('hides unexpected errors behind a generic 500', () => {
    const { status, body } = run(
      new Error('connection string postgres://secret'),
    );
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('secret');
  });
});
