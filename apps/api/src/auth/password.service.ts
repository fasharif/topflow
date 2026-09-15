import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { InjectConfig } from '../config/config.module';
import type { AppConfig } from '../config/env';

@Injectable()
export class PasswordService {
  private readonly rounds: number;
  /** Compared against when the account does not exist, so response times don't reveal it. */
  private readonly dummyHash: Promise<string>;

  constructor(@InjectConfig() config: AppConfig) {
    this.rounds = config.auth.bcryptRounds;
    this.dummyHash = bcrypt.hash('timing-attack-mitigation', this.rounds);
  }

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.rounds);
  }

  async verify(
    plain: string,
    hash: string | null | undefined,
  ): Promise<boolean> {
    if (!hash) {
      await bcrypt.compare(plain, await this.dummyHash);
      return false;
    }
    return bcrypt.compare(plain, hash);
  }
}
