import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { HealthDto } from '@topflow/shared';
import type { Response } from 'express';
import { Public } from '../common/decorators';
import { InjectConfig } from '../config/config.module';
import type { AppConfig } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Health')
@SkipThrottle()
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @InjectConfig() private readonly config: AppConfig,
  ) {}

  @Public()
  @Get()
  root(): { name: string; version: string; docs: string | null } {
    return {
      name: 'Top Flow API',
      version: this.config.app.version,
      docs: this.config.http.swaggerEnabled ? '/docs' : null,
    };
  }

  /** Liveness: the process is up. Never touches dependencies. */
  @Public()
  @Get('health')
  live(): HealthDto {
    return {
      status: 'ok',
      version: this.config.app.version,
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  /** Readiness: the database answers. Returns 503 so load balancers stop routing traffic. */
  @Public()
  @Get('health/ready')
  async ready(@Res({ passthrough: true }) res: Response): Promise<HealthDto> {
    const base = {
      version: this.config.app.version,
      uptimeSeconds: Math.round(process.uptime()),
    };
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ...base, status: 'ok', database: 'up' };
    } catch {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { ...base, status: 'degraded', database: 'down' };
    }
  }
}
