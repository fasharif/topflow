import type { OrganizationContext } from '../common/request-context';
import { money, moneyOrNull } from '../common/serialization';
import type { PrismaService } from '../prisma/prisma.service';

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Loads the caller's membership in an organization, or null if they are not a member. */
export async function resolveOrganizationContext(
  prisma: PrismaService,
  userId: string,
  organizationId: string,
): Promise<OrganizationContext | null> {
  if (!UUID_PATTERN.test(organizationId)) {
    return null;
  }
  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    include: {
      organization: {
        select: { name: true, status: true, discountRate: true },
      },
    },
  });
  if (!membership) {
    return null;
  }
  return {
    organizationId,
    organizationName: membership.organization.name,
    organizationStatus: membership.organization.status,
    discountRate: money(membership.organization.discountRate),
    memberId: membership.id,
    role: membership.role,
    approvalLimit: moneyOrNull(membership.approvalLimit),
  };
}
