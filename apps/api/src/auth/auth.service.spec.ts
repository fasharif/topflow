import { Test } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { user: any };

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn(), create: jest.fn() } };
    const jwt = { sign: jest.fn().mockReturnValue('fake-jwt-token') };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  it('rejects registration when the email is already in use', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(
      service.register({
        email: 'a@a.com',
        password: 'password123',
        fullName: 'A',
        phoneNumber: '1',
      } as any),
    ).rejects.toThrow(ConflictException);
  });

  it('hashes the password before storing it — never stores plain text', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'u1', ...data, role: 'CUSTOMER' }),
    );

    await service.register({
      email: 'a@a.com',
      password: 'password123',
      fullName: 'A',
      phoneNumber: '1',
    });

    const stored = prisma.user.create.mock.calls[0][0].data;
    expect(stored.passwordHash).not.toBe('password123');
    expect(await bcrypt.compare('password123', stored.passwordHash)).toBe(true);
  });

  it('rejects login with an incorrect password', async () => {
    const realHash = await bcrypt.hash('correctpassword', 10);
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@a.com',
      passwordHash: realHash,
      role: 'CUSTOMER',
    });

    await expect(
      service.login({ email: 'a@a.com', password: 'wrongpassword' } as any),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects login for a user that does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      service.login({ email: 'nobody@a.com', password: 'anything' } as any),
    ).rejects.toThrow(UnauthorizedException);
  });
});
