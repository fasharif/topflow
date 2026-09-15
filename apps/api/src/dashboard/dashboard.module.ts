import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  OrderStatus,
  OrgStatus,
  Permission,
  QuotationStatus,
  RfqStatus,
  enumValues,
  type DashboardStatsDto,
} from '@topflow/shared';
import { DAY_MS } from '../common/dates';
import { RequirePermissions } from '../common/decorators';
import { moneyOrNull } from '../common/serialization';
import { orderSummaryInclude, toOrderSummary } from '../orders/order.mapper';
import { PrismaService } from '../prisma/prisma.service';

function zeroed<T extends string>(values: readonly T[]): Record<T, number> {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<
    T,
    number
  >;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async stats(): Promise<DashboardStatsDto> {
    const since = new Date(Date.now() - 30 * DAY_MS);
    const [
      orderGroups,
      rfqGroups,
      awaitingResponse,
      pendingApproval,
      pendingOrganizations,
      revenue,
      ordersLast30Days,
      lowStock,
      recent,
    ] = await Promise.all([
      this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.quoteRequest.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.quotation.count({ where: { status: QuotationStatus.SENT } }),
      this.prisma.quotation.count({
        where: { status: QuotationStatus.PENDING_APPROVAL },
      }),
      this.prisma.organization.count({
        where: { status: OrgStatus.PENDING_VERIFICATION },
      }),
      this.prisma.order.aggregate({
        where: {
          createdAt: { gte: since },
          status: { not: OrderStatus.CANCELLED },
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.order.count({ where: { createdAt: { gte: since } } }),
      this.prisma.product.findMany({
        // Column-to-column comparison: each product has its own reorder threshold.
        where: {
          isActive: true,
          stockQuantity: { lte: this.prisma.product.fields.lowStockThreshold },
        },
        select: {
          id: true,
          sku: true,
          name: true,
          stockQuantity: true,
          lowStockThreshold: true,
        },
        orderBy: { stockQuantity: 'asc' },
        take: 10,
      }),
      this.prisma.order.findMany({
        include: orderSummaryInclude,
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ]);

    const ordersByStatus = zeroed(enumValues(OrderStatus));
    for (const group of orderGroups)
      ordersByStatus[group.status] = group._count._all;
    const rfqsByStatus = zeroed(enumValues(RfqStatus));
    for (const group of rfqGroups)
      rfqsByStatus[group.status] = group._count._all;

    return {
      ordersByStatus,
      rfqsByStatus,
      quotationsAwaitingResponse: awaitingResponse,
      quotationsPendingApproval: pendingApproval,
      pendingOrganizations,
      revenueLast30Days: moneyOrNull(revenue._sum.totalAmount) ?? '0.00',
      ordersLast30Days,
      lowStockProducts: lowStock,
      recentOrders: recent.map(toOrderSummary),
    };
  }
}

@ApiTags('Admin · Dashboard')
@ApiBearerAuth()
@Controller('admin/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @RequirePermissions(Permission.DASHBOARD_VIEW)
  stats(): Promise<DashboardStatsDto> {
    return this.dashboard.stats();
  }
}

@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
