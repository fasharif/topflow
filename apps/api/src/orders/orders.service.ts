import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { OrderStatus } from 'database/dist/generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  private generateOrderNumber(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const rand = randomUUID().split('-')[0].toUpperCase();
    return `TF-${y}${m}${d}-${rand}`;
  }

  async create(userId: string, dto: CreateOrderDto) {
    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    for (const item of dto.items) {
      if (!productMap.has(item.productId)) {
        throw new NotFoundException(`Product ${item.productId} not found`);
      }
    }

    const orderItemsData = dto.items.map((item) => {
      const product = productMap.get(item.productId)!;
      const unitPrice = Number(product.unitPrice);
      const totalPrice = Math.round(unitPrice * item.quantity * 100) / 100;
      return {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        unitPrice,
        quantity: item.quantity,
        totalPrice,
      };
    });

    const totalAmount =
      Math.round(orderItemsData.reduce((sum, i) => sum + i.totalPrice, 0) * 100) / 100;

    return this.prisma.order.create({
      data: {
        orderNumber: this.generateOrderNumber(),
        userId,
        status: OrderStatus.ENQUIRY_SUBMITTED,
        totalAmount,
        shippingAddress: dto.shippingAddress,
        projectReference: dto.projectReference,
        notes: dto.notes,
        items: { create: orderItemsData },
      },
      include: { items: true },
    });
  }

  findAllForUser(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, role: string, id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true, user: true },
    });
    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    const isOwner = order.userId === userId;
    const isStaff = role === 'ADMIN' || role === 'WAREHOUSE';
    if (!isOwner && !isStaff) {
      throw new ForbiddenException('You do not have access to this order');
    }
    return order;
  }
}