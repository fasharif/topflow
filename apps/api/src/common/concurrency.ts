import { ConflictException } from '@nestjs/common';
import { ErrorCode } from '@topflow/shared';

/**
 * The answer to a request that lost a race. The services read a record, decide, and then write
 * with the state they read in the WHERE clause of the UPDATE or DELETE. PostgreSQL evaluates that
 * clause under the row lock (at its default isolation level, READ COMMITTED, a statement that
 * waited for another transaction checks the committed row again), so when another request changed
 * the record first, the write matches no row. The caller throws this inside its transaction, which
 * rolls back: nothing is written for the request that lost.
 *
 * `what` names the record for the person reading the message ("quotation", "order").
 */
export function concurrentUpdate(what: string): ConflictException {
  return new ConflictException({
    message: `This ${what} was changed by someone else a moment ago, so your change was not applied. Reload it to see where it stands now.`,
    code: ErrorCode.CONCURRENT_UPDATE,
  });
}
