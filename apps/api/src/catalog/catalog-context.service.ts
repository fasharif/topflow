import { Injectable } from '@nestjs/common';
import {
  ORGANIZATION_HEADER,
  OrgStatus,
  Permission,
  hasPermission,
} from '@topflow/shared';
import type {
  AppRequest,
  OrganizationContext,
} from '../common/request-context';
import { resolveOrganizationContext } from '../organizations/organization-context';
import { PrismaService } from '../prisma/prisma.service';
import { pricingContextFor, type PricingContext } from './pricing';

export interface CatalogViewer {
  organization: OrganizationContext | null;
  pricing: PricingContext;
  /** Organization members may browse and quote trade-only products. */
  canSeeTradeOnly: boolean;
  /** Staff may include unpublished products. */
  canSeeInactive: boolean;
}

/**
 * The catalog is public, but what it shows depends on the viewer: retail shoppers see
 * VAT-inclusive list prices; members of a verified organization (x-organization-id header)
 * additionally see trade-only products and their negotiated trade prices.
 */
@Injectable()
export class CatalogContextService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(request: AppRequest): Promise<CatalogViewer> {
    const user = request.user;
    const organizationId = request.get(ORGANIZATION_HEADER);
    let organization: OrganizationContext | null = null;

    if (user && organizationId) {
      organization = await resolveOrganizationContext(
        this.prisma,
        user.id,
        organizationId,
      );
      if (organization?.organizationStatus === OrgStatus.SUSPENDED) {
        organization = null;
      }
    }

    const isCatalogStaff = hasPermission(user?.role, Permission.CATALOG_WRITE);
    // Sales staff quote trade-only items, so they need to find them in the catalog.
    const quotesProducts = hasPermission(
      user?.role,
      Permission.QUOTATIONS_MANAGE,
    );
    return {
      organization,
      pricing: pricingContextFor(organization),
      canSeeTradeOnly:
        organization !== null || isCatalogStaff || quotesProducts,
      canSeeInactive: isCatalogStaff,
    };
  }
}
