import { Controller, Post, Get, Body, Param, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { KycService } from './kyc.service';

@Controller('kyc')
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Get(':id/status')
  getStatus(@Param('id') id: string) {
    return this.kycService.getStatus(id);
  }

  @Post(':id/pan-verify')
  verifyPan(@Param('id') id: string, @Body('panNumber') panNumber: string) {
    return this.kycService.verifyPan(id, panNumber);
  }

  @Post(':id/aadhaar-otp')
  generateAadhaarOtp(@Param('id') id: string, @Body('aadhaarNumber') aadhaarNumber: string) {
    return this.kycService.generateAadhaarOtp(id, aadhaarNumber);
  }

  @Post(':id/aadhaar-verify')
  verifyAadhaar(@Param('id') id: string, @Body('otp') otp: string, @Body('sessionId') sessionId: string) {
    return this.kycService.verifyAadhaar(id, otp, sessionId);
  }

  @Post(':id/bank-statement')
  @UseInterceptors(FileInterceptor('file'))
  uploadBankStatement(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    return this.kycService.processBankStatement(id, file);
  }

  @Post(':id/cibil')
  fetchCibil(@Param('id') id: string) {
    return this.kycService.fetchCibil(id);
  }
}
