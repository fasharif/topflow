import { OrgRole, OrgStatus } from '@topflow/shared';
import type { OrganizationContext } from '../common/request-context';
import {
  RETAIL_PRICING,
  pricingContextFor,
  retailPrice,
  tradePrice,
} from './pricing';

const organization = (
  organizationStatus: OrgStatus,
  discountRate = '7.50',
): OrganizationContext => ({
  organizationId: 'org-1',
  organizationName: 'Desert Bloom',
  organizationStatus,
  discountRate,
  memberId: 'member-1',
  role: OrgRole.BUYER,
  approvalLimit: null,
});

describe('pricing', () => {
  it('shows consumers VAT-inclusive prices', () => {
    expect(retailPrice('38.50')).toBe('40.43');
  });

  it('applies the negotiated discount for verified organizations', () => {
    expect(
      tradePrice('38.50', pricingContextFor(organization(OrgStatus.ACTIVE))),
    ).toBe('35.61');
  });

  it('withholds trade prices until an organization is verified', () => {
    expect(
      pricingContextFor(organization(OrgStatus.PENDING_VERIFICATION)),
    ).toBe(RETAIL_PRICING);
    expect(tradePrice('38.50', RETAIL_PRICING)).toBeNull();
  });
});
