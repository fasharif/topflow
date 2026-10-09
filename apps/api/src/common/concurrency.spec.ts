import { ConflictException } from '@nestjs/common';
import { ErrorCode } from '@topflow/shared';
import { concurrentUpdate } from './concurrency';

describe('concurrentUpdate', () => {
  it('is a 409 with the code clients test for and a message that says what to do', () => {
    const error = concurrentUpdate('quotation');
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toEqual({
      code: ErrorCode.CONCURRENT_UPDATE,
      message:
        'This quotation was changed by someone else a moment ago, so your change was not applied. Reload it to see where it stands now.',
    });
  });
});
