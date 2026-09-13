import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AddressBookService } from './address-book.service';
import { AccountController, AdminUsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule],
  controllers: [AccountController, AdminUsersController],
  providers: [UsersService, AddressBookService],
  exports: [AddressBookService],
})
export class UsersModule {}
