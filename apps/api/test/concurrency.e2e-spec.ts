import type { Response, Test } from 'supertest';
import { E2eHarness, type TestSession } from './support/harness';
import { TradeFixture, staffSession } from './support/trade';

// Two requests that change the same record at the same moment, through HTTP against PostgreSQL
// (BUG-18 to BUG-22 in docs/testing/BUGS-FOUND.md). Each test checks two things: that the answers
// are those of the two requests made one after the other (in most cases one success and one 409
// with the code CONCURRENT_UPDATE), and that the database afterwards holds what the successful
// request alone would have left.
//
// Most tests start the competing requests in the same tick with Promise.all. A race does not show
// every time, so they run several rounds, each on records made for that round. Where the window is
// too narrow for that (one request is two statements, the other a transaction), the test queues
// the requests behind a row lock instead, which fixes the order in which they write.
// tests/scripts/mutation-check.mts removes each guard in turn and fails if these tests still pass.

const ROUNDS = [1, 2, 3, 4, 5];
const SKU = 'AX-EFS-002';

const harness = new E2eHarness();
let sales: TestSession;
let trade: TradeFixture;

beforeAll(async () => {
  await harness.start();
  sales = await staffSession(harness, 'sales');
  trade = new TradeFixture(harness, sales, (await harness.product(SKU)).id);
});

afterAll(async () => {
  await harness.stop();
});

/** Starts every request in the same tick and waits for all the answers. */
function atOnce(...requests: Test[]): Promise<Response[]> {
  return Promise.all(requests);
}

/**
 * Starts the requests one by one while this test holds a lock on a row they all write to, then
 * releases the lock. Each request runs as far as its first write to that row and waits there, so
 * every request has read the row before any of them changes it, and they then write in the order
 * they were started.
 */
async function queuedBehindLock(
  table:
    | 'quotations'
    | 'quote_requests'
    | 'organizations'
    | 'organization_invitations',
  id: string,
  ...requests: Test[]
): Promise<Response[]> {
  const answers: Promise<Response>[] = [];
  await harness.prisma.$transaction(
    async (tx) => {
      await tx.$queryRawUnsafe(
        `SELECT "id" FROM "${table}" WHERE "id" = $1 FOR UPDATE`,
        id,
      );
      for (const request of requests) {
        answers.push(request.then((response) => response));
        // Wait until this request, too, is waiting for the lock before starting the next one.
        // pg_locks is read from the lock manager each time; pg_stat_activity would be a
        // snapshot kept for the whole transaction.
        for (let attempt = 0; ; attempt++) {
          const [{ waiting }] = await tx.$queryRaw<Array<{ waiting: number }>>`
            SELECT count(*)::int AS "waiting" FROM pg_locks WHERE NOT granted`;
          if (waiting >= answers.length) break;
          if (attempt === 200)
            throw new Error('A request never reached the lock');
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      }
    },
    { timeout: 20_000 },
  );
  return Promise.all(answers);
}

/** The answer of a request that lost a race: 409, a code clients can test for, and what to do. */
function expectLostRace(response: Response): void {
  expect(response.status).toBe(409);
  expect(response.body).toMatchObject({
    statusCode: 409,
    error: 'Conflict',
    code: 'CONCURRENT_UPDATE',
    message: expect.stringMatching(/Reload/) as string,
  });
}

/** Exactly one request succeeded; the other lost the race and was told so. Returns the winner. */
function expectOneWinner(responses: Response[], success = 200): Response {
  expect(responses.map((r) => r.status).sort()).toEqual([success, 409]);
  const [winner] = responses.filter((r) => r.status === success);
  const [loser] = responses.filter((r) => r.status === 409);
  expectLostRace(loser);
  return winner;
}

const ordersFor = (quotationId: string) =>
  harness.prisma.order.count({ where: { quotationId } });

const auditEntries = (entityId: string, action: string) =>
  harness.prisma.auditLog.count({ where: { entityId, action } });

async function quotationStatus(id: string): Promise<string> {
  return (
    await harness.prisma.quotation.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    })
  ).status;
}

describe('answers to one quotation at the same moment', () => {
  let organizationId: string;
  let owner: TestSession;
  let approver: TestSession;
  let buyer: TestSession;

  const respond = (
    member: TestSession,
    quotation: { id: string },
    body: Record<string, unknown>,
  ) =>
    harness
      .http()
      .post(`/org/quotations/${quotation.id}/respond`)
      .set(harness.member(member, organizationId))
      .send(body);

  const decide = (
    member: TestSession,
    quotation: { id: string },
    body: Record<string, unknown>,
  ) =>
    harness
      .http()
      .post(`/org/quotations/${quotation.id}/approval`)
      .set(harness.member(member, organizationId))
      .send(body);

  beforeAll(async () => {
    ({ owner, organizationId } = await trade.organization('Race Quotations'));
    approver = (await trade.member(owner, organizationId, 'APPROVER')).session;
    buyer = (await trade.member(owner, organizationId, 'BUYER', '50.00'))
      .session;
  });

  it.each(ROUNDS)(
    'round %i: an acceptance and a rejection: one takes effect, and an order exists only if it was the acceptance',
    async () => {
      const quotation = await trade.sentQuotation(organizationId, owner);
      const [accept, reject] = await atOnce(
        respond(owner, quotation, { action: 'ACCEPT' }),
        respond(approver, quotation, {
          action: 'REJECT',
          note: 'Too expensive',
        }),
      );
      expectOneWinner([accept, reject]);
      const accepted = accept.status === 200;
      expect(await quotationStatus(quotation.id)).toBe(
        accepted ? 'ACCEPTED' : 'REJECTED',
      );
      expect(await ordersFor(quotation.id)).toBe(accepted ? 1 : 0);
      expect(
        await auditEntries(quotation.id, 'procurement.quotation_responded'),
      ).toBe(1);
    },
  );

  it.each(ROUNDS)('round %i: two acceptances create one order', async () => {
    const quotation = await trade.sentQuotation(organizationId, owner);
    const responses = await atOnce(
      respond(owner, quotation, { action: 'ACCEPT' }),
      respond(approver, quotation, { action: 'ACCEPT' }),
    );
    const winner = expectOneWinner(responses);
    expect(winner.body).toMatchObject({ status: 'ACCEPTED' });
    expect(await ordersFor(quotation.id)).toBe(1);
  });

  it.each(ROUNDS)(
    'round %i: a request for approval and an acceptance within the limit: the status and the order agree',
    async () => {
      // Net 100.00 is above the buyer's limit of 50.00, so the buyer's acceptance waits for an
      // approver, while the owner's acceptance creates the order at once.
      const quotation = await trade.sentQuotation(organizationId, buyer);
      const [request, accept] = await atOnce(
        respond(buyer, quotation, { action: 'ACCEPT' }),
        respond(owner, quotation, { action: 'ACCEPT' }),
      );
      expectOneWinner([request, accept]);
      const accepted = accept.status === 200;
      expect(await quotationStatus(quotation.id)).toBe(
        accepted ? 'ACCEPTED' : 'PENDING_APPROVAL',
      );
      expect(await ordersFor(quotation.id)).toBe(accepted ? 1 : 0);
    },
  );

  it.each(ROUNDS)(
    'round %i: an approval and a decline: one takes effect, and an order exists only if it was the approval',
    async () => {
      const quotation = await trade.sentQuotation(organizationId, buyer);
      await respond(buyer, quotation, { action: 'ACCEPT' }).expect(200);
      const [approve, decline] = await atOnce(
        decide(owner, quotation, { decision: 'APPROVE' }),
        decide(approver, quotation, { decision: 'DECLINE', note: 'Not now' }),
      );
      expectOneWinner([approve, decline]);
      const approved = approve.status === 200;
      expect(await quotationStatus(quotation.id)).toBe(
        approved ? 'ACCEPTED' : 'SENT',
      );
      expect(await ordersFor(quotation.id)).toBe(approved ? 1 : 0);
      expect(
        await auditEntries(
          quotation.id,
          'procurement.quotation_approval_decided',
        ),
      ).toBe(1);
    },
  );

  it.each(ROUNDS)(
    'round %i: a personal quotation accepted and rejected: one takes effect',
    async () => {
      const shopper = await trade.shopper();
      const quotation = await trade.send(
        (await trade.draftQuotation({ customerId: shopper.session.user.id }))
          .id,
      );
      const answer = (body: Record<string, unknown>) =>
        harness
          .http()
          .post(`/me/quotations/${quotation.id}/respond`)
          .set(harness.bearer(shopper.session))
          .send(body);
      const [accept, reject] = await atOnce(
        answer({ action: 'ACCEPT', addressId: shopper.addressId }),
        answer({ action: 'REJECT', note: 'Changed my mind' }),
      );
      expectOneWinner([accept, reject]);
      const accepted = accept.status === 200;
      expect(await quotationStatus(quotation.id)).toBe(
        accepted ? 'ACCEPTED' : 'REJECTED',
      );
      expect(await ordersFor(quotation.id)).toBe(accepted ? 1 : 0);
    },
  );
});

describe('a revision sent while the earlier one is accepted', () => {
  /** A sent quotation and the draft of its next revision, with the two competing requests. */
  async function revised() {
    const { owner, organizationId } =
      await trade.organization('Race Revisions');
    const first = await trade.sentQuotation(organizationId, owner);
    const second = (
      await harness
        .http()
        .post(`/admin/quotations/${first.id}/revise`)
        .set(harness.bearer(sales))
        .send({})
        .expect(201)
    ).body as { id: string };
    return {
      first,
      second,
      accept: harness
        .http()
        .post(`/org/quotations/${first.id}/respond`)
        .set(harness.member(owner, organizationId))
        .send({ action: 'ACCEPT' }),
      send: harness
        .http()
        .post(`/admin/quotations/${second.id}/send`)
        .set(harness.bearer(sales)),
    };
  }

  it.each(ROUNDS)(
    'round %i: the earlier revision is accepted with an order, or superseded without one',
    async () => {
      const { first, second, accept, send } = await revised();
      const [accepted, sent] = await atOnce(accept, send);
      // Sending the revision succeeds either way. The acceptance wins if it came first; if the
      // revision came first, the earlier one is superseded and can no longer be accepted.
      expect(sent.status).toBe(200);
      expect([200, 409]).toContain(accepted.status);
      const won = accepted.status === 200;
      expect(await quotationStatus(first.id)).toBe(
        won ? 'ACCEPTED' : 'SUPERSEDED',
      );
      expect(await ordersFor(first.id)).toBe(won ? 1 : 0);
      expect(await quotationStatus(second.id)).toBe('SENT');
    },
  );

  it('accepted first: the revision is sent, and the accepted one is not superseded', async () => {
    const { first, second, accept, send } = await revised();
    const [accepted, sent] = await queuedBehindLock(
      'quotations',
      first.id,
      accept,
      send,
    );
    expect([accepted.status, sent.status]).toEqual([200, 200]);
    expect(await quotationStatus(first.id)).toBe('ACCEPTED');
    expect(await ordersFor(first.id)).toBe(1);
    expect(await quotationStatus(second.id)).toBe('SENT');
  });

  it('superseded first: the acceptance is refused and creates no order', async () => {
    const { first, accept, send } = await revised();
    const [sent, accepted] = await queuedBehindLock(
      'quotations',
      first.id,
      send,
      accept,
    );
    expect(sent.status).toBe(200);
    expectLostRace(accepted);
    expect(await quotationStatus(first.id)).toBe('SUPERSEDED');
    expect(await ordersFor(first.id)).toBe(0);
  });
});

describe('first drafts for one RFQ at the same moment', () => {
  it.each(ROUNDS)('round %i: the RFQ gets one quotation', async () => {
    const { owner, organizationId } = await trade.organization('Race Drafts');
    const rfq = await trade.rfq(owner, organizationId);
    const draft = () =>
      harness
        .http()
        .post('/admin/quotations')
        .set(harness.bearer(sales))
        .send({
          quoteRequestId: rfq.id,
          items: [{ productId: trade.productId, quantity: 1 }],
        });
    const responses = await atOnce(draft(), draft());
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      await harness.prisma.quotation.count({
        where: { quoteRequestId: rfq.id },
      }),
    ).toBe(1);
  });
});

describe('a draft quotation sent while it is edited or discarded', () => {
  // Editing and discarding take fewer statements than sending, so when both start at the same
  // moment the same request always wins. These tests queue the requests behind the quotation's
  // row instead, in both orders.
  const send = (quotationId: string) =>
    harness
      .http()
      .post(`/admin/quotations/${quotationId}/send`)
      .set(harness.bearer(sales));
  const discard = (quotationId: string) =>
    harness
      .http()
      .delete(`/admin/quotations/${quotationId}`)
      .set(harness.bearer(sales));
  const edit = (quotationId: string) =>
    harness
      .http()
      .patch(`/admin/quotations/${quotationId}`)
      .set(harness.bearer(sales))
      .send({ deliveryFee: '40.00' });
  const personalDraft = async () =>
    trade.draftQuotation({
      customerId: (await trade.shopper()).session.user.id,
    });
  const totals = async (quotationId: string) => {
    const stored = await harness.prisma.quotation.findUniqueOrThrow({
      where: { id: quotationId },
      select: { status: true, total: true, deliveryFee: true },
    });
    return {
      status: stored.status,
      total: stored.total.toFixed(2),
      deliveryFee: stored.deliveryFee.toFixed(2),
    };
  };

  it('sent, then edited by a request that read it as a draft: the customer keeps the total they were sent', async () => {
    const draft = await personalDraft();
    const [sent, edited] = await queuedBehindLock(
      'quotations',
      draft.id,
      send(draft.id),
      edit(draft.id),
    );
    expect(sent.status).toBe(200);
    expectLostRace(edited);
    expect(await totals(draft.id)).toEqual({
      status: 'SENT',
      total: (sent.body as { total: string }).total,
      deliveryFee: '0.00',
    });
  });

  it('edited, then sent: the edited quotation is what the customer is sent', async () => {
    const draft = await personalDraft();
    const [edited, sent] = await queuedBehindLock(
      'quotations',
      draft.id,
      edit(draft.id),
      send(draft.id),
    );
    expect([edited.status, sent.status]).toEqual([200, 200]);
    expect(await totals(draft.id)).toEqual({
      status: 'SENT',
      total: (sent.body as { total: string }).total,
      deliveryFee: '40.00',
    });
  });

  it('sent, then discarded by a request that read it as a draft: it stays, sent', async () => {
    const draft = await personalDraft();
    const [sent, discarded] = await queuedBehindLock(
      'quotations',
      draft.id,
      send(draft.id),
      discard(draft.id),
    );
    expect(sent.status).toBe(200);
    expectLostRace(discarded);
    expect(await quotationStatus(draft.id)).toBe('SENT');
  });

  it('discarded, then sent by a request that read it as a draft: it is gone and was never sent', async () => {
    const draft = await personalDraft();
    const [discarded, sent] = await queuedBehindLock(
      'quotations',
      draft.id,
      discard(draft.id),
      send(draft.id),
    );
    expect(discarded.status).toBe(204);
    expectLostRace(sent);
    expect(
      await harness.prisma.quotation.count({ where: { id: draft.id } }),
    ).toBe(0);
  });
});

describe('changes to one order at the same moment', () => {
  let warehouse: TestSession;

  beforeAll(async () => {
    warehouse = await staffSession(harness, 'warehouse');
  });

  const setStatus = (
    staff: TestSession,
    order: { id: string },
    body: Record<string, unknown>,
  ) =>
    harness
      .http()
      .patch(`/admin/orders/${order.id}/status`)
      .set(harness.bearer(staff))
      .send(body);

  const stored = async (order: { id: string }) =>
    harness.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: {
        status: true,
        paymentStatus: true,
        events: { select: { fromStatus: true, toStatus: true, note: true } },
      },
    });

  const stock = async () => (await harness.product(SKU)).stockQuantity;

  it.each(ROUNDS)(
    'round %i: two dispatches deduct the stock once and write one timeline entry',
    async () => {
      const order = await trade.retailOrder(await trade.shopper(), 2);
      await setStatus(warehouse, order, { status: 'PROCESSING' }).expect(200);
      const before = await stock();
      const responses = await atOnce(
        setStatus(warehouse, order, { status: 'DISPATCHED' }),
        setStatus(warehouse, order, { status: 'DISPATCHED' }),
      );
      expectOneWinner(responses);
      expect(await stock()).toBe(before - 2);
      const after = await stored(order);
      expect(after.status).toBe('DISPATCHED');
      expect(
        after.events.filter((event) => event.toStatus === 'DISPATCHED'),
      ).toHaveLength(1);
      // One audit entry for picking and one for the dispatch.
      expect(await auditEntries(order.id, 'orders.status_changed')).toBe(2);
    },
  );

  it.each(ROUNDS)(
    'round %i: a cancellation and a dispatch: the order is dispatched with its stock deducted, or cancelled with the stock untouched',
    async () => {
      const order = await trade.retailOrder(await trade.shopper(), 2);
      await setStatus(warehouse, order, { status: 'PROCESSING' }).expect(200);
      const before = await stock();
      const [cancel, dispatch] = await atOnce(
        setStatus(sales, order, { status: 'CANCELLED', note: 'Race' }),
        setStatus(warehouse, order, { status: 'DISPATCHED' }),
      );
      expectOneWinner([cancel, dispatch]);
      const dispatched = dispatch.status === 200;
      const after = await stored(order);
      expect(after.status).toBe(dispatched ? 'DISPATCHED' : 'CANCELLED');
      expect(await stock()).toBe(dispatched ? before - 2 : before);
      // One entry out of Processing: the timeline tells the same story as the status.
      expect(
        after.events
          .filter((event) => event.fromStatus === 'PROCESSING')
          .map((event) => event.toStatus),
      ).toEqual([after.status]);
    },
  );

  it.each(ROUNDS)(
    'round %i: two cancellations write one timeline entry and one audit entry',
    async () => {
      const shopper = await trade.shopper();
      const order = await trade.retailOrder(shopper);
      const responses = await atOnce(
        harness
          .http()
          .post(`/me/orders/${order.id}/cancel`)
          .set(harness.bearer(shopper.session))
          .send({ reason: 'Ordered twice' }),
        setStatus(sales, order, { status: 'CANCELLED', note: 'Duplicate' }),
      );
      expectOneWinner(responses);
      const after = await stored(order);
      expect(after.status).toBe('CANCELLED');
      expect(
        after.events.filter((event) => event.toStatus === 'CANCELLED'),
      ).toHaveLength(1);
      expect(await auditEntries(order.id, 'orders.cancelled')).toBe(1);
    },
  );

  it.each(ROUNDS)(
    "round %i: a customer's cancellation and a payment record: never a cancelled order that the customer paid",
    async () => {
      const shopper = await trade.shopper();
      const order = await trade.retailOrder(shopper);
      const [cancel, payment] = await atOnce(
        harness
          .http()
          .post(`/me/orders/${order.id}/cancel`)
          .set(harness.bearer(shopper.session))
          .send({ reason: 'Changed my mind' }),
        harness
          .http()
          .post(`/admin/orders/${order.id}/payment`)
          .set(harness.bearer(sales))
          .send({ paymentReference: 'RACE-PAY' }),
      );
      expectOneWinner([cancel, payment]);
      const after = await stored(order);
      expect([after.status, after.paymentStatus]).toEqual(
        payment.status === 200
          ? ['CONFIRMED', 'PAID']
          : ['CANCELLED', 'UNPAID'],
      );
    },
  );

  it.each(ROUNDS)(
    'round %i: two refund records write one timeline entry and one audit entry',
    async () => {
      const order = await trade.retailOrder(await trade.shopper());
      await harness
        .http()
        .post(`/admin/orders/${order.id}/payment`)
        .set(harness.bearer(sales))
        .send({ paymentReference: 'RACE-PAID' })
        .expect(200);
      await setStatus(sales, order, {
        status: 'CANCELLED',
        note: 'Cancelled after payment',
      }).expect(200);
      const refund = () =>
        harness
          .http()
          .post(`/admin/orders/${order.id}/refund`)
          .set(harness.bearer(sales))
          .send({ refundReference: 'RACE-REFUND' });
      expectOneWinner(await atOnce(refund(), refund()));
      const after = await stored(order);
      expect(after.paymentStatus).toBe('REFUNDED');
      expect(
        after.events.filter((event) => event.note?.includes('RACE-REFUND')),
      ).toHaveLength(1);
      expect(await auditEntries(order.id, 'orders.refund_recorded')).toBe(1);
    },
  );
});

describe('owner changes at the same moment', () => {
  const owners = async (organizationId: string) =>
    harness.prisma.organizationMember.count({
      where: { organizationId, role: 'OWNER' },
    });

  /** A new organization with two owners; each entry is an owner's session and membership id. */
  async function twoOwners(name: string) {
    const { owner, organizationId } = await trade.organization(name);
    const second = await trade.member(owner, organizationId, 'OWNER');
    const first = (await trade.members(owner, organizationId)).find(
      (member) => member.userId === owner.user.id,
    );
    if (!first) throw new Error('The founding owner is not a member');
    return {
      organizationId,
      a: { session: owner, memberId: first.id },
      b: second,
    };
  }

  /** The second request is refused by the rule itself: it would have left no owner. */
  function expectOneOwnerKept(responses: Response[], success: number): void {
    expect(responses.map((r) => r.status).sort()).toEqual([success, 409]);
    const [refused] = responses.filter((r) => r.status === 409);
    expect(refused.body).toMatchObject({
      message: 'An organization must always have at least one owner',
    });
  }

  it.each(ROUNDS)(
    'round %i: two owners demote each other: one remains an owner',
    async (round) => {
      const { organizationId, a, b } = await twoOwners(`Race Owners ${round}`);
      const demote = (
        actor: { session: TestSession },
        target: { memberId: string },
      ) =>
        harness
          .http()
          .patch(`/org/members/${target.memberId}`)
          .set(harness.member(actor.session, organizationId))
          .send({ role: 'BUYER' });
      expectOneOwnerKept(await atOnce(demote(a, b), demote(b, a)), 200);
      expect(await owners(organizationId)).toBe(1);
    },
  );

  it.each(ROUNDS)(
    'round %i: two owners remove each other: one remains',
    async (round) => {
      const { organizationId, a, b } = await twoOwners(`Race Removal ${round}`);
      const remove = (
        actor: { session: TestSession },
        target: { memberId: string },
      ) =>
        harness
          .http()
          .delete(`/org/members/${target.memberId}`)
          .set(harness.member(actor.session, organizationId));
      expectOneOwnerKept(await atOnce(remove(a, b), remove(b, a)), 204);
      expect(await owners(organizationId)).toBe(1);
    },
  );
});

describe('an invitation revoked while it is accepted', () => {
  let organizationId: string;
  let owner: TestSession;

  beforeAll(async () => {
    ({ owner, organizationId } = await trade.organization('Race Invitations'));
  });

  /** A pending invitation with the two competing requests and what they leave behind. */
  async function invited() {
    const { invitationId, token, invitee } = await trade.invite(
      owner,
      organizationId,
      'BUYER',
    );
    return {
      invitationId,
      accept: harness
        .http()
        .post('/invitations/accept')
        .set(harness.bearer(invitee))
        .send({ token }),
      revoke: harness
        .http()
        .delete(`/org/invitations/${invitationId}`)
        .set(harness.member(owner, organizationId)),
      outcome: async () => {
        const invitation =
          await harness.prisma.organizationInvitation.findUniqueOrThrow({
            where: { id: invitationId },
            select: { acceptedAt: true, revokedAt: true },
          });
        return {
          accepted: invitation.acceptedAt !== null,
          revoked: invitation.revokedAt !== null,
          memberships: await harness.prisma.organizationMember.count({
            where: { organizationId, userId: invitee.user.id },
          }),
        };
      },
    };
  }

  it.each(ROUNDS)(
    'round %i: the invitee joins, or the invitation is revoked and nobody joins',
    async () => {
      const { accept, revoke, outcome } = await invited();
      const [accepted, revoked] = await atOnce(accept, revoke);
      // The acceptance answers 409 when the revocation overtook it, or 404 when the invitation
      // was already revoked as it started; a revocation that came second answers 404.
      const joined = accepted.status === 200;
      expect(revoked.status).toBe(joined ? 404 : 204);
      expect(joined ? [200] : [404, 409]).toContain(accepted.status);
      expect(await outcome()).toEqual({
        accepted: joined,
        revoked: !joined,
        memberships: joined ? 1 : 0,
      });
    },
  );

  it('revoked first, then accepted by a request that read it as pending: nobody joins', async () => {
    const { invitationId, accept, revoke, outcome } = await invited();
    const [revoked, accepted] = await queuedBehindLock(
      'organization_invitations',
      invitationId,
      revoke,
      accept,
    );
    expect(revoked.status).toBe(204);
    expectLostRace(accepted);
    expect(await outcome()).toEqual({
      accepted: false,
      revoked: true,
      memberships: 0,
    });
  });
});

describe('an RFQ cancelled while sales close it', () => {
  let organizationId: string;
  let owner: TestSession;

  beforeAll(async () => {
    ({ owner, organizationId } = await trade.organization('Race Requests'));
  });

  /** An RFQ in review, with the customer's cancellation and the closing by sales. */
  async function inReview() {
    const rfq = await trade.rfq(owner, organizationId);
    const update = (status: string) =>
      harness
        .http()
        .patch(`/admin/rfqs/${rfq.id}`)
        .set(harness.bearer(sales))
        .send({ status });
    await update('IN_REVIEW').expect(200);
    return {
      rfqId: rfq.id,
      cancel: harness
        .http()
        .post(`/org/rfqs/${rfq.id}/cancel`)
        .set(harness.member(owner, organizationId)),
      close: update('CLOSED'),
      status: async () =>
        (
          await harness.prisma.quoteRequest.findUniqueOrThrow({
            where: { id: rfq.id },
            select: { status: true },
          })
        ).status,
    };
  }

  it.each(ROUNDS)(
    'round %i: the RFQ is cancelled or closed, as the one successful request left it',
    async () => {
      const { cancel, close, status } = await inReview();
      const [cancelled, closed] = await atOnce(cancel, close);
      // Both statuses are final, so the second request is refused whether it lost the race (409
      // with CONCURRENT_UPDATE) or simply came later (409 from the lifecycle).
      expect([cancelled.status, closed.status].sort()).toEqual([200, 409]);
      const expected = cancelled.status === 200 ? 'CANCELLED' : 'CLOSED';
      const winner = cancelled.status === 200 ? cancelled : closed;
      expect(winner.body).toMatchObject({ status: expected });
      expect(await status()).toBe(expected);
    },
  );

  it('closed first, then cancelled by a request that read it as in review: it stays closed', async () => {
    const { rfqId, cancel, close, status } = await inReview();
    const [closed, cancelled] = await queuedBehindLock(
      'quote_requests',
      rfqId,
      close,
      cancel,
    );
    expect(closed.status).toBe(200);
    expectLostRace(cancelled);
    expect(await status()).toBe('CLOSED');
  });
});

describe('a company profile edited while the company is suspended', () => {
  it('suspended first, then a new trade licence number from a request that read it as active: the suspension stands', async () => {
    const { owner, organizationId } = await trade.organization('Race Profile');
    const [suspended, edited] = await queuedBehindLock(
      'organizations',
      organizationId,
      harness
        .http()
        .patch(`/admin/organizations/${organizationId}/review`)
        .set(harness.bearer(sales))
        .send({ status: 'SUSPENDED' }),
      harness
        .http()
        .patch('/org')
        .set(harness.member(owner, organizationId))
        .send({ tradeLicenseNumber: 'DED-RACE-PROFILE' }),
    );
    expect(suspended.status).toBe(200);
    expectLostRace(edited);
    expect(
      await harness.prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { status: true, tradeLicenseNumber: true },
      }),
    ).toMatchObject({
      status: 'SUSPENDED',
      tradeLicenseNumber: expect.not.stringMatching(
        'DED-RACE-PROFILE',
      ) as string,
    });
  });
});
