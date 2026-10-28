import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { LoginAttempts } from './login-attempts';
import { PhoneVerificationRepository } from './phone-verification.repository';
import { LogSmsSender, SmsSender } from './sms.sender';
import { BusinessModule } from '../business/business.module';
import { ExpensesModule } from '../expenses/expenses.module';

@Module({
  imports: [BusinessModule, ExpensesModule],
  controllers: [AuthController],
  providers: [
    AuthRepository,
    AuthService,
    LoginAttempts,
    PhoneVerificationRepository,
    // SMS_DRIVER picks the sender; `log` is the only one until a gateway is added.
    { provide: SmsSender, useClass: LogSmsSender },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
