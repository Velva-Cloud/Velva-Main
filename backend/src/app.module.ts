import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PlansModule } from './plans/plans.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { ServersModule } from './servers/servers.module';
import { NodesModule } from './nodes/nodes.module';
import { LogsModule } from './logs/logs.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { StatusModule } from './status/status.module';
import { TransactionsModule } from './transactions/transactions.module';
import { StripeModule } from './billing/stripe.module';
import { MailModule } from './mail/mail.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      { name: 'global', ttl: 60, limit: 100 },
      { name: 'auth-std', ttl: 60, limit: 10 },
      { name: 'auth-low', ttl: 60, limit: 5 },
    ]),
    PrismaModule,
    AuthModule,
    UsersModule,
    PlansModule,
    SubscriptionsModule,
    ServersModule,
    NodesModule,
    LogsModule,
    StatusModule,
    TransactionsModule,
    StripeModule,
    MailModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}