import { Module } from '@nestjs/common';
import { KycService } from './kyc.service';
import { KycController } from './kyc.controller';
import { PrismaService } from '../prisma.service';
import { TruIdService } from '../truid/truid.service';
import { UnderwritingService } from '../underwriting/underwriting.service';

@Module({
  controllers: [KycController],
  providers: [KycService, PrismaService, TruIdService, UnderwritingService],
})
export class KycModule {}
