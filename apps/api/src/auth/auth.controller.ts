import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '@topflow/shared';
import { CurrentUser } from '../common/decorators';
import type { AuthenticatedUser } from '../common/request-context';
import { AuthService } from './auth.service';

@ApiTags('Authentication')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('me')
  @ApiOperation({
    summary:
      'The signed-in user: role, permissions, organizations and two-factor status. Sign-in itself happens with Supabase Auth.',
  })
  me(@CurrentUser() user: AuthenticatedUser): Promise<AuthUser> {
    return this.auth.getAuthUser(user);
  }
}
