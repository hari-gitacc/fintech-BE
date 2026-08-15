import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ApplicationsModule } from './applications/applications.module';
import { KycModule } from './kyc/kyc.module';

@Module({
  imports: [ApplicationsModule, KycModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
