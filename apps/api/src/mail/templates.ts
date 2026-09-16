import type { Omit } from '../common/type-utils';
import type { MailMessage } from './mail.service';

type Template = Omit<MailMessage, 'to'>;

// Account emails (sign-up confirmation, password recovery, staff invitations, email changes)
// are sent by Supabase Auth with the branded templates in supabase/templates.

const signature =
  '\n\n— Top Flow · Irrigation & Flow Control Supplies\nwww.topflow.ae';

export function invitationEmail(
  organizationName: string,
  inviterName: string,
  roleLabel: string,
  url: string,
): Template {
  return {
    subject: `${inviterName} invited you to ${organizationName} on Top Flow`,
    text: `Hello,\n\n${inviterName} has invited you to join ${organizationName} as ${roleLabel} on the Top Flow trade portal.\n\nAccept the invitation (sign in or create your account with this email address first):\n${url}\n\nThe invitation expires in 7 days.${signature}`,
  };
}

export function quoteRequestReceivedEmail(
  name: string,
  requestNumber: string,
  lineCount: number,
): Template {
  const scope =
    lineCount === 0
      ? 'your project enquiry'
      : `your quote request (${lineCount} item${lineCount === 1 ? '' : 's'})`;
  return {
    subject: `We received your quote request ${requestNumber}`,
    text: `Hello ${name},\n\nThank you for ${scope}, reference ${requestNumber}. Our sales team will review it and get back to you with a formal quotation.\n\nPlease quote ${requestNumber} if you contact us about this request.${signature}`,
  };
}

export function quotationSentEmail(
  name: string,
  quotationNumber: string,
  total: string,
  validUntil: string,
  url: string,
): Template {
  return {
    subject: `Quotation ${quotationNumber} is ready`,
    text: `Hello ${name},\n\nYour quotation ${quotationNumber} for ${total} (incl. VAT) is ready for review. It is valid until ${validUntil}.\n\nReview, accept or request changes:\n${url}${signature}`,
  };
}

export function approvalRequestEmail(
  approverName: string,
  buyerName: string,
  quotationNumber: string,
  total: string,
  url: string,
): Template {
  return {
    subject: `Approval needed: quotation ${quotationNumber}`,
    text: `Hello ${approverName},\n\n${buyerName} wants to accept quotation ${quotationNumber} for ${total} (incl. VAT), which exceeds their purchasing limit.\n\nReview and approve or decline:\n${url}${signature}`,
  };
}

export function orderStatusEmail(
  name: string,
  orderNumber: string,
  statusLabel: string,
  url: string,
  note?: string | null,
): Template {
  return {
    subject: `Order ${orderNumber}: ${statusLabel}`,
    text: `Hello ${name},\n\nYour order ${orderNumber} is now: ${statusLabel}.${note ? `\n\n${note}` : ''}\n\nTrack your order:\n${url}${signature}`,
  };
}
