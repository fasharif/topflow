import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: { product: any; order: any };

  beforeEach(async () => {
    prisma = {
      product: { findMany: jest.fn() },
      order: { create: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [OrdersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(OrdersService);
  });

  it('calculates totalAmount correctly from unit price and quantity', async () => {
    prisma.product.findMany.mockResolvedValue([
      { id: 'p1', name: 'Sprinkler', sku: 'WS-533', unitPrice: 45.5 },
    ]);
    prisma.order.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'order1', ...data }),
    );

    const dto = {
      items: [{ productId: 'p1', quantity: 3 }],
      shippingAddress: 'Site A',
    };
    const result = await service.create('user1', dto);

    expect(result.totalAmount).toBe(136.5); // 45.5 * 3
  });

  it('throws NotFoundException when a product does not exist', async () => {
    prisma.product.findMany.mockResolvedValue([]);
    const dto = {
      items: [{ productId: 'missing', quantity: 1 }],
      shippingAddress: 'Site A',
    };

    await expect(service.create('user1', dto as any)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('generates an order number in the TF-YYYYMMDD-XXXXXXXX format', async () => {
    prisma.product.findMany.mockResolvedValue([
      { id: 'p1', name: 'Sprinkler', sku: 'WS-533', unitPrice: 10 },
    ]);
    prisma.order.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'order1', ...data }),
    );

    const dto = {
      items: [{ productId: 'p1', quantity: 1 }],
      shippingAddress: 'Site A',
    };
    const result = await service.create('user1', dto);

    expect(result.orderNumber).toMatch(/^TF-\d{8}-[A-F0-9]{8}$/);
  });
});
