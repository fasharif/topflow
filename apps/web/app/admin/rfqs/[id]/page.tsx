'use client';

import {
  Permission,
  RFQ_SOURCE_LABELS,
  RFQ_TRANSITIONS,
  RfqSource,
  RfqStatus,
  Role,
  hasPermission,
  updateRfqSchema,
  type AssignRfqCustomerInput,
  type RfqDto,
  type UpdateRfqInput,
} from '@topflow/shared';
import { FileText, Mail, Phone, Send, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { AddressBlock, DetailList, QueryError, RfqSourceBadge, SectionLabel, telHref } from '@/components/admin/detail';
import { RequireAuth } from '@/components/require-auth';
import { QuotationStatusBadge, RfqStatusBadge } from '@/components/status-badge';
import { Alert, BackLink, Button, Card, CardHeader, EmptyState, LinkButton, LoadingBlock, PageHeader, Table, Td, Th, buttonClass } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { aed, formatDate, formatDateTime, pluralize } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useApiQuery } from '@/lib/use-api';

interface StatusAction {
  status: RfqStatus;
  label: string;
  /** Asked before a change that can't be undone. */
  confirm?: string;
}

/** Status changes offered in the triage card, limited to the transitions the RFQ currently allows. */
function statusActions(rfq: RfqDto): StatusAction[] {
  const actions: StatusAction[] = [
    {
      status: RfqStatus.CLOSED,
      label: 'Close RFQ',
      confirm:
        rfq.source === RfqSource.WEBSITE
          ? 'Close this request? Do this once the customer has had a reply. It cannot be reopened.'
          : 'Close this RFQ? No new quotations can be created for it, and this cannot be undone.',
    },
    { status: RfqStatus.CANCELLED, label: 'Cancel RFQ', confirm: 'Cancel this RFQ? This cannot be undone.' },
  ];
  // Drafting a quotation moves an RFQ into review automatically. Requests that are answered outside the
  // platform need it done by hand before they can be closed. A quoted RFQ only returns to review through a
  // revision request, so this is offered for new requests only.
  if (rfq.status === RfqStatus.SUBMITTED) actions.unshift({ status: RfqStatus.IN_REVIEW, label: 'Mark in review' });
  return actions.filter((action) => RFQ_TRANSITIONS[rfq.status].includes(action.status));
}

/** "Acme Landscaping" for trade RFQs; "Website enquiry from Sara Khan (Green Villas)" for website requests. */
function requesterSummary(rfq: RfqDto): string {
  if (rfq.source !== RfqSource.WEBSITE) return rfq.organization?.name ?? 'Unknown organization';
  const contact = rfq.contact;
  if (!contact?.name) return 'Website enquiry';
  return `Website enquiry from ${contact.name}${contact.companyName ? ` (${contact.companyName})` : ''}`;
}

function NotGiven() {
  return <span className="font-normal text-slate-500">Not given</span>;
}

function ContactItem({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium break-words text-ink-900">{children}</dd>
    </div>
  );
}

/** Who to reply to for a request sent from the public website, which starts without an account. */
function WebsiteEnquiryCard({ rfq }: { rfq: RfqDto }) {
  const { contact } = rfq;
  const title = 'Website enquiry';
  const description = rfq.requestedBy
    ? 'Sent from the public website. Quotations for it go to the linked customer account.'
    : 'Sent from the public website without an account. Reply to the contact directly, or link a customer account to send a formal quotation.';
  const notes = (
    <div>
      <SectionLabel>Notes from the customer</SectionLabel>
      {rfq.notes ? <p className="whitespace-pre-line text-sm text-slate-700">{rfq.notes}</p> : <p className="text-sm text-slate-500">No notes were added.</p>}
    </div>
  );

  if (!contact) {
    return (
      <Card>
        <CardHeader title={title} description={description} />
        <div className="space-y-5 p-5">
          <Alert tone="warning">No contact details were saved with this request, so there is nobody to reply to.</Alert>
          {notes}
        </div>
      </Card>
    );
  }

  const replyHref = `mailto:${contact.email}?subject=${encodeURIComponent(`Your quote request ${rfq.number}`)}`;
  return (
    <Card>
      <CardHeader
        title={title}
        description={description}
        action={
          <div className="flex flex-wrap gap-2">
            <a href={replyHref} className={buttonClass('primary', 'sm')}>
              <Mail aria-hidden="true" />
              Reply by email<span className="sr-only"> to {contact.name || contact.email}</span>
            </a>
            {contact.phone && (
              <a href={telHref(contact.phone)} className={buttonClass('secondary', 'sm')}>
                <Phone aria-hidden="true" />
                Call
                <span className="sr-only">
                  {' '}
                  {contact.name} on {contact.phone}
                </span>
              </a>
            )}
          </div>
        }
      />
      <div className="space-y-5 p-5">
        <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <ContactItem label="Name">{contact.name || <NotGiven />}</ContactItem>
          <ContactItem label="Company">{contact.companyName || <NotGiven />}</ContactItem>
          <ContactItem label="Email">
            <a href={`mailto:${contact.email}`} className="break-all text-brand-700 hover:underline">
              {contact.email}
            </a>
          </ContactItem>
          <ContactItem label="Phone">
            {contact.phone ? (
              <a href={telHref(contact.phone)} className="whitespace-nowrap text-brand-700 hover:underline">
                {contact.phone}
              </a>
            ) : (
              <NotGiven />
            )}
          </ContactItem>
          <ContactItem label="Emirate / delivery" wide>
            {rfq.deliveryAddress ? <AddressBlock address={rfq.deliveryAddress} /> : rfq.shippingAddress || <NotGiven />}
          </ContactItem>
        </dl>
        {notes}
      </div>
    </Card>
  );
}

/**
 * A quotation is addressed to a customer account, where the customer accepts it online. For a website
 * request, staff link the account that already uses the contact's email — personally or for one of its
 * organizations — or invite the contact, which creates the account and emails them a sign-in link.
 */
function CustomerLinkPanel({ rfq, onLinked }: { rfq: RfqDto; onLinked: (rfq: RfqDto) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { contact, contactAccount: account } = rfq;

  if (!contact) {
    return (
      <EmptyState
        title="A quotation needs a customer account"
        description="This request has no contact details, so it can't be linked to a customer."
        icon={<UserRound aria-hidden="true" />}
      />
    );
  }

  const contactName = contact.name || contact.email;
  const link = async (key: string, body: AssignRfqCustomerInput) => {
    setBusy(key);
    setError(null);
    try {
      onLinked(await api<RfqDto>(`/admin/rfqs/${rfq.id}/customer`, { method: 'POST', body }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  let choice: ReactNode;
  if (!account) {
    choice = (
      <>
        <p className="text-sm text-slate-700">
          No account uses <span className="font-medium text-ink-900">{contact.email}</span> yet. Inviting {contactName} creates their customer account and emails
          them a link to choose a password, so they can accept the quotation online.
        </p>
        <Button size="sm" className="mt-3" loading={busy === 'invite'} disabled={busy !== null} onClick={() => void link('invite', {})}>
          {busy !== 'invite' && <Send aria-hidden="true" />}
          Invite {contactName}
        </Button>
      </>
    );
  } else if (account.role !== Role.CUSTOMER || !account.isActive) {
    choice = (
      <Alert tone="warning">
        {account.email} belongs to {account.isActive ? 'a Top Flow staff account' : 'a suspended account'}, so it can’t receive quotations. Reply to the contact
        directly instead.
      </Alert>
    );
  } else {
    choice = (
      <>
        <p className="text-sm text-slate-700">
          <span className="font-medium text-ink-900">{account.fullName}</span> already has an account with {account.email}.
          {account.organizations.length > 0 && ' Quote them personally, or for one of their organizations.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" loading={busy === 'person'} disabled={busy !== null} onClick={() => void link('person', { customerId: account.id })}>
            Quote {account.fullName}
          </Button>
          {account.organizations.map((organization) => (
            <Button
              key={organization.id}
              size="sm"
              variant="secondary"
              loading={busy === organization.id}
              disabled={busy !== null}
              onClick={() => void link(organization.id, { customerId: account.id, organizationId: organization.id })}
            >
              Quote {organization.name}
            </Button>
          ))}
        </div>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-flow-50 text-flow-700">
          <UserRound aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold text-ink-900">Link a customer account</h3>
          <p className="mt-0.5 text-sm text-slate-600">A quotation is sent to a customer account, where the customer can accept it online.</p>
        </div>
      </div>
      <div className="rounded-lg border border-slate-200 p-4">{choice}</div>
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}

function RfqDetail({ id }: { id: string }) {
  const { user } = useSession();
  const query = useApiQuery<RfqDto>(`/admin/rfqs/${id}`);
  const [updated, setUpdated] = useState<RfqDto | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rfq = updated ?? query.data;

  if (!rfq) {
    return query.error ? (
      <QueryError error={query.error} onRetry={query.reload} title="Could not load this RFQ" backHref="/admin/rfqs" backLabel="Back to RFQs" />
    ) : (
      <LoadingBlock label="Loading RFQ…" />
    );
  }

  const website = rfq.source === RfqSource.WEBSITE;
  const canQuote = hasPermission(user?.role, Permission.QUOTATIONS_MANAGE);
  const canReviewOrganizations = hasPermission(user?.role, Permission.ORGANIZATIONS_REVIEW);
  const terminal = RFQ_TRANSITIONS[rfq.status].length === 0;
  const open = rfq.status === RfqStatus.SUBMITTED || rfq.status === RfqStatus.IN_REVIEW;
  const assignedToMe = Boolean(user && rfq.assignedTo?.id === user.id);
  const actions = statusActions(rfq);
  const createHref = `/admin/quotations/new?rfq=${rfq.id}`;

  const update = async (key: string, input: UpdateRfqInput) => {
    const parsed = updateRfqSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid update');
      return;
    }
    setBusy(key);
    setError(null);
    try {
      setUpdated(await api<RfqDto>(`/admin/rfqs/${rfq.id}`, { method: 'PATCH', body: parsed.data }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  let noQuotation: ReactNode;
  if (!open) {
    noQuotation = <p className="text-sm text-slate-500">No quotation was issued for this request.</p>;
  } else if (!rfq.requestedBy) {
    // A quotation is addressed to a customer account, and the API rejects an RFQ without one.
    noQuotation = website ? (
      <CustomerLinkPanel rfq={rfq} onLinked={setUpdated} />
    ) : (
      <EmptyState
        title="A quotation needs a customer account"
        description="The account that sent this request no longer exists, so a formal quotation can’t be issued for it."
        icon={<UserRound aria-hidden="true" />}
      />
    );
  } else if (canQuote) {
    noQuotation = (
      <EmptyState
        title="No quotation yet"
        description={
          rfq.organization
            ? `Price the requested items for ${rfq.organization.name} — their trade discount is applied automatically — then send it to the customer.`
            : `Price the requested items, then send the quotation to ${rfq.requestedBy.fullName}’s account.`
        }
        icon={<FileText aria-hidden="true" />}
        action={<LinkButton href={createHref}>Create quotation</LinkButton>}
      />
    );
  } else {
    noQuotation = <p className="text-sm text-slate-500">No quotation was issued for this request.</p>;
  }

  return (
    <>
      <BackLink href="/admin/rfqs">RFQs</BackLink>
      <PageHeader
        title={<span className="font-mono">{rfq.number}</span>}
        description={
          <>
            {requesterSummary(rfq)} · submitted {formatDateTime(rfq.createdAt)}
          </>
        }
        actions={
          <>
            <RfqSourceBadge source={rfq.source} />
            <RfqStatusBadge status={rfq.status} />
          </>
        }
      />

      {error && (
        <div className="mb-6">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6 xl:order-last">
          <Card>
            <CardHeader title="Triage" />
            <div className="space-y-5 p-5">
              <div>
                <SectionLabel>Sales owner</SectionLabel>
                {rfq.assignedTo ? (
                  <p className="text-sm font-medium text-ink-900">
                    {rfq.assignedTo.fullName}
                    {assignedToMe && <span className="font-normal text-slate-500"> (you)</span>}
                  </p>
                ) : (
                  <p className="text-sm font-medium text-warning-700">Unassigned</p>
                )}
                {user && !assignedToMe && !terminal && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                    loading={busy === 'assign'}
                    disabled={busy !== null}
                    onClick={() => void update('assign', { assignedToId: user.id })}
                  >
                    Assign to me
                  </Button>
                )}
              </div>
              {actions.length > 0 && (
                <div>
                  <SectionLabel>Status</SectionLabel>
                  <div className="flex flex-wrap gap-2">
                    {actions.map((action) => (
                      <Button
                        key={action.status}
                        variant="secondary"
                        size="sm"
                        loading={busy === action.status}
                        disabled={busy !== null}
                        onClick={() => {
                          if (!action.confirm || window.confirm(action.confirm)) void update(action.status, { status: action.status });
                        }}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                  {website && rfq.status === RfqStatus.SUBMITTED && !rfq.requestedBy && (
                    <p className="mt-2 text-xs text-slate-500">If you reply outside the platform, mark it in review, then close it once the customer has an answer.</p>
                  )}
                </div>
              )}
              {terminal && <p className="text-sm text-slate-500">This request is closed.</p>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Details" />
            <div className="space-y-5 p-5">
              <DetailList
                items={[
                  { label: 'Source', value: RFQ_SOURCE_LABELS[rfq.source] },
                  {
                    label: 'Organization',
                    hidden: website && !rfq.organization,
                    value:
                      rfq.organization && canReviewOrganizations ? (
                        <Link href={`/admin/organizations/${rfq.organization.id}`} className="text-brand-700 hover:underline">
                          {rfq.organization.name}
                        </Link>
                      ) : (
                        rfq.organization?.name
                      ),
                  },
                  {
                    label: website ? 'Customer account' : 'Requested by',
                    hidden: website && !rfq.requestedBy,
                    value: rfq.requestedBy ? (
                      <>
                        <span className="block">{rfq.requestedBy.fullName}</span>
                        {rfq.requestedBy.email && (
                          <a href={`mailto:${rfq.requestedBy.email}`} className="text-xs font-normal text-brand-700 hover:underline">
                            {rfq.requestedBy.email}
                          </a>
                        )}
                      </>
                    ) : null,
                  },
                  { label: 'Project reference', value: rfq.projectReference, hidden: website && !rfq.projectReference },
                  { label: 'Required by', value: rfq.requiredBy ? formatDate(rfq.requiredBy) : null, hidden: website && !rfq.requiredBy },
                  { label: 'Last updated', value: formatDateTime(rfq.updatedAt) },
                ]}
              />
              {/* Website requests show the emirate in the enquiry card instead. */}
              {!website && (
                <div>
                  <SectionLabel>Delivery site</SectionLabel>
                  <AddressBlock address={rfq.deliveryAddress} fallback={rfq.shippingAddress} />
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          {website && <WebsiteEnquiryCard rfq={rfq} />}

          <Card>
            <CardHeader title="Quotations" description={rfq.quotations.length > 0 ? 'Newest revision first, including drafts.' : undefined} />
            {rfq.quotations.length === 0 ? (
              <div className="p-5">{noQuotation}</div>
            ) : (
              <ul className="divide-y divide-slate-200">
                {rfq.quotations.map((quotation) => (
                  <li key={quotation.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div>
                      {canQuote ? (
                        <Link href={`/admin/quotations/${quotation.id}`} className="font-mono text-sm font-semibold text-brand-700 hover:underline">
                          {quotation.displayNumber}
                        </Link>
                      ) : (
                        <span className="font-mono text-sm font-semibold text-ink-900">{quotation.displayNumber}</span>
                      )}
                      <p className="text-xs text-slate-500">
                        Created {formatDate(quotation.createdAt)} · valid until {formatDate(quotation.validUntil)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <QuotationStatusBadge status={quotation.status} expired={quotation.isExpired} />
                      <span className="font-semibold tabular-nums text-ink-900">{aed(quotation.total)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {rfq.notes && !website && (
            <Card className="p-5">
              <SectionLabel>Notes from the customer</SectionLabel>
              <p className="whitespace-pre-line text-sm text-slate-700">{rfq.notes}</p>
            </Card>
          )}

          <section>
            <h2 className="heading-4 mb-3 text-ink-900">
              Requested items <span className="font-normal text-slate-500">· {pluralize(rfq.items.length, 'line')}</span>
            </h2>
            <Table>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th className="text-right">Quantity</Th>
                  <Th>Customer note</Th>
                </tr>
              </thead>
              <tbody>
                {rfq.items.map((item) => (
                  <tr key={item.id}>
                    <Td>
                      <p className="font-medium text-ink-900">{item.productName}</p>
                      <p className="font-mono text-xs text-slate-500">
                        {item.sku}
                        {!item.productId && <span className="ml-2 font-sans text-warning-700">No longer in the catalogue</span>}
                      </p>
                    </Td>
                    <Td className="text-right tabular-nums">{item.quantity}</Td>
                    <Td className="text-slate-600">{item.notes ?? <span className="text-slate-500">—</span>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </section>
        </div>
      </div>
    </>
  );
}

export default function AdminRfqPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireAuth permission={Permission.RFQS_MANAGE}>
      <RfqDetail key={id} id={id} />
    </RequireAuth>
  );
}
