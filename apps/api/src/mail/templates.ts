import type { Omit } from '../common/type-utils';
import type { MailMessage } from './mail.service';

type Template = Omit<MailMessage, 'to'>;

const signature =
  '\n\n— Top Flow · Irrigation & Flow Control Supplies\nwww.topflow.ae';

export function verificationEmail(name: string, url: string): Template {
  return {
    subject: 'Confirm your Top Flow email address',
    text: `Hello ${name},\n\nPlease confirm your email address to finish setting up your account:\n${url}\n\nThis link is valid for 24 hours.${signature}`,
  };
}

export function passwordResetEmail(
  name: string,
  url: string,
  ttlMinutes: number,
): Template {
  return {
    subject: 'Reset your Top Flow password',
    text: `Hello ${name},\n\nWe received a request to reset your password. Use the link below within ${ttlMinutes} minutes:\n${url}\n\nIf you did not request this, you can safely ignore this email — your password will not change.${signature}`,
  };
}

export function invitationEmail(
  organizationName: string,
  inviterName: string,
  roleLabel: string,
  url: string,
): Template {
  return {
    subject: `${inviterName} invited you to ${organizationName} on Top Flow`,
    text: `Hello,\n\n${inviterName} has invited you to join ${organizationName} as ${roleLabel} on the Top Flow trade portal.\n\nAccept the invitation:\n${url}\n\nThe invitation expires in 7 days.${signature}`,
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
