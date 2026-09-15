import { Injectable, NotFoundException } from '@nestjs/common';
import type { Address, Prisma } from '@topflow/database';
import {
  EMIRATE_LABELS,
  type AddressDto,
  type AddressInput,
  type AddressSnapshot,
  type UpdateAddressInput,
} from '@topflow/shared';
import { PrismaService } from '../prisma/prisma.service';

/** An address book belongs either to a person (retail) or to an organization (delivery sites). */
export type AddressOwner = { userId: string } | { organizationId: string };

export function toAddressDto(address: Address): AddressDto {
  return {
    id: address.id,
    label: address.label,
    contactName: address.contactName,
    phoneNumber: address.phoneNumber,
    line1: address.line1,
    line2: address.line2,
    area: address.area,
    city: address.city,
    emirate: address.emirate,
    country: address.country,
    isDefault: address.isDefault,
  };
}

/** Immutable copy stored on orders/RFQs so later address edits never rewrite history. */
export function addressSnapshot(
  address: Address | AddressInput,
): AddressSnapshot {
  return {
    label: address.label,
    contactName: address.contactName,
    phoneNumber: address.phoneNumber,
    line1: address.line1,
    line2: address.line2 ?? null,
    area: address.area,
    city: address.city,
    emirate: address.emirate,
    country: 'country' in address && address.country ? address.country : 'AE',
  };
}

export function formatAddress(address: AddressSnapshot): string {
  return [
    address.line1,
    address.line2,
    address.area,
    address.city,
    EMIRATE_LABELS[address.emirate],
    'United Arab Emirates',
  ]
    .filter(Boolean)
    .join(', ');
}

@Injectable()
export class AddressBookService {
  constructor(private readonly prisma: PrismaService) {}

  async list(owner: AddressOwner): Promise<AddressDto[]> {
    const addresses = await this.prisma.address.findMany({
      where: owner,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return addresses.map(toAddressDto);
  }

  async get(owner: AddressOwner, id: string): Promise<Address> {
    const address = await this.prisma.address.findFirst({
      where: { id, ...owner },
    });
    if (!address) {
      throw new NotFoundException('Address not found');
    }
    return address;
  }

  async create(owner: AddressOwner, input: AddressInput): Promise<AddressDto> {
    const address = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.address.count({ where: owner });
      const isDefault = input.isDefault || existing === 0;
      if (isDefault) {
        await tx.address.updateMany({
          where: owner,
          data: { isDefault: false },
        });
      }
      return tx.address.create({ data: { ...input, ...owner, isDefault } });
    });
    return toAddressDto(address);
  }

  async update(
    owner: AddressOwner,
    id: string,
    input: UpdateAddressInput,
  ): Promise<AddressDto> {
    await this.get(owner, id);
    const address = await this.prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.address.updateMany({
          where: owner,
          data: { isDefault: false },
        });
      }
      return tx.address.update({ where: { id }, data: input });
    });
    return toAddressDto(address);
  }

  async remove(owner: AddressOwner, id: string): Promise<void> {
    const address = await this.get(owner, id);
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.address.delete({ where: { id } });
      if (address.isDefault) {
        const next = await tx.address.findFirst({
          where: owner,
          orderBy: { createdAt: 'asc' },
        });
        if (next) {
          await tx.address.update({
            where: { id: next.id },
            data: { isDefault: true },
          });
        }
      }
    });
  }
}
