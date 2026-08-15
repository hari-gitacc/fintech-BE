import {
  Injectable,
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { TruIdService } from '../truid/truid.service';
import { UnderwritingService } from '../underwriting/underwriting.service';

@Injectable()
export class KycService {
  constructor(
    private prisma: PrismaService,
    private truidService: TruIdService,
    private underwritingService: UnderwritingService,
  ) {}

  // ─── Helper: fetch app + borrower or throw ───
  private async findApplicationOrThrow(applicationId: string) {
    const app = await this.prisma.loanApplication.findUnique({
      where: { id: applicationId },
      include: { borrower: true },
    });
    if (!app) throw new NotFoundException(`Application ${applicationId} not found.`);
    return app;
  }

  // ─── GET status (hydrate frontend) ───
  async getStatus(applicationId: string) {
    const app = await this.findApplicationOrThrow(applicationId);

    return {
      applicationId: app.id,
      status: app.status,
      borrowerName: app.borrower.fullName,
      mobile: app.borrower.mobile,
      requestedAmount: app.requestedAmount,
      panVerified: app.panVerified,
      panAadhaarLinked: app.panAadhaarLinked,
      okycVerified: app.okycVerified,
      equifaxScore: app.equifaxScore,
      verifiedMonthlyIncome: app.verifiedMonthlyIncome,
    };
  }

  // ─── STEP 1: PAN Verification ───
  async verifyPan(applicationId: string, panNumber: string) {
    if (!panNumber || !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNumber.toUpperCase())) {
      throw new BadRequestException('Invalid PAN format. Must be 10 characters like ABCDE1234F.');
    }

    const app = await this.findApplicationOrThrow(applicationId);

    // Call TruId PAN Detailed API
    let result: any;
    try {
      result = await this.truidService.verifyPanDetailed(panNumber.toUpperCase(), app.borrower.fullName);
    } catch (err) {
      // TruIdService already throws HttpException for known errors
      if (err instanceof HttpException) throw err;
      throw new HttpException('PAN verification service is temporarily unavailable.', HttpStatus.BAD_GATEWAY);
    }

    const panData = result.data;

    // Validate the PAN is actually active
    if (!panData.pan_active) {
      throw new BadRequestException(`PAN ${panNumber} is inactive or deactivated.`);
    }

    // Update the LoanApplication with PAN verification flags
    await this.prisma.loanApplication.update({
      where: { id: applicationId },
      data: {
        panVerified: true,
        panAadhaarLinked: panData.aadhaar_linked ?? false,
        panTaxCompliant: panData.tax_compliant ?? false,
        status: 'PAN_VERIFIED',
      },
    });

    // Update borrower with PAN-sourced data (dob, gender)
    await this.prisma.borrower.update({
      where: { id: app.borrowerId },
      data: {
        dob: panData.dob || undefined,
        gender: panData.gender || undefined,
      },
    });

    return {
      success: true,
      message: 'PAN verified successfully.',
      data: {
        pan_number: panData.pan_number,
        registered_name: panData.registered_name,
        dob: panData.dob,
        gender: panData.gender,
        aadhaar_linked: panData.aadhaar_linked,
        tax_compliant: panData.tax_compliant,
        category: panData.category,
      },
    };
  }

  // ─── STEP 2a: Aadhaar OKYC — Generate OTP ───
  async generateAadhaarOtp(applicationId: string, aadhaarNumber: string) {
    if (!aadhaarNumber || !/^\d{12}$/.test(aadhaarNumber)) {
      throw new BadRequestException('Invalid Aadhaar number. Must be exactly 12 digits.');
    }

    // Validate that the application exists
    await this.findApplicationOrThrow(applicationId);

    let result: any;
    try {
      result = await this.truidService.generateOkycOtp(aadhaarNumber);
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException('Aadhaar OTP service is temporarily unavailable.', HttpStatus.BAD_GATEWAY);
    }

    const otpData = result.data;

    // Check if OTP was actually sent
    if (!otpData.sent) {
      const reason = otpData.failure_reason || 'OTP could not be sent. Please check the Aadhaar number.';
      throw new BadRequestException(reason);
    }

    return {
      success: true,
      sessionId: otpData.session_id,
      mobileMasked: otpData.mobile_masked || null,
    };
  }

  // ─── STEP 2b: Aadhaar OKYC — Verify OTP ───
  async verifyAadhaar(applicationId: string, otp: string, sessionId: string) {
    if (!otp || otp.length < 6) {
      throw new BadRequestException('OTP must be at least 6 digits.');
    }
    if (!sessionId) {
      throw new BadRequestException('Session ID is required. Please generate OTP first.');
    }

    const app = await this.findApplicationOrThrow(applicationId);

    let result: any;
    try {
      result = await this.truidService.getOkycResult(sessionId, otp);
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException('Aadhaar verification service is temporarily unavailable.', HttpStatus.BAD_GATEWAY);
    }

    const okycData = result.data;

    // Check if verification actually passed
    if (!okycData.verified) {
      const reason = okycData.failure_reason || 'Aadhaar OTP verification failed. Please try again.';
      throw new BadRequestException(reason);
    }

    // Update LoanApplication
    await this.prisma.loanApplication.update({
      where: { id: applicationId },
      data: {
        okycVerified: true,
        status: 'OKYC_COMPLETED',
      },
    });

    // Update Borrower with eKYC data
    const addressObj = okycData.address || {};
    await this.prisma.borrower.update({
      where: { id: app.borrowerId },
      data: {
        dob: okycData.dob || undefined,
        gender: okycData.gender || undefined,
        address: {
          house: addressObj.house,
          street: addressObj.street,
          landmark: addressObj.landmark,
          locality: addressObj.locality,
          district: addressObj.district,
          state: addressObj.state,
          pincode: addressObj.pincode,
          country: addressObj.country,
        },
      },
    });

    return {
      success: true,
      message: 'Aadhaar eKYC verified successfully.',
      data: {
        name: okycData.name,
        dob: okycData.dob,
        gender: okycData.gender,
        aadhaar_masked: okycData.aadhaar_masked,
        care_of: okycData.care_of,
        address: okycData.address,
      },
    };
  }

  // ─── STEP 3: Bank Statement Upload ───
  async processBankStatement(applicationId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded. Please attach a bank statement PDF.');
    }

    await this.findApplicationOrThrow(applicationId);

    // In production: upload to S3, pass URL to analyzer
    const mockUrl = `local-upload-${file.originalname}`;
    const analysis = await this.underwritingService.analyzeBankStatement(mockUrl);

    await this.prisma.loanApplication.update({
      where: { id: applicationId },
      data: {
        verifiedMonthlyIncome: analysis.verifiedMonthlyIncome,
        status: 'BANK_PARSED',
      },
    });

    return { success: true, data: analysis };
  }

  // ─── STEP 4: CIBIL / Equifax Score ───
  async fetchCibil(applicationId: string) {
    const app = await this.findApplicationOrThrow(applicationId);

    const rawPan = Buffer.from(app.borrower.encryptedPan, 'base64').toString('utf8');

    let formattedDob = undefined;
    if (app.borrower.dob) {
      const dobStr = app.borrower.dob;
      if (/^\d{4}-\d{2}-\d{2}$/.test(dobStr)) {
        formattedDob = dobStr;
      } else if (/^\d{2}-\d{2}-\d{4}$/.test(dobStr)) {
        const [dd, mm, yyyy] = dobStr.split('-');
        formattedDob = `${yyyy}-${mm}-${dd}`;
      } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dobStr)) {
        const [dd, mm, yyyy] = dobStr.split('/');
        formattedDob = `${yyyy}-${mm}-${dd}`;
      }
    }

    let formattedGender = undefined;
    if (app.borrower.gender) {
      const g = app.borrower.gender.toUpperCase();
      if (g === 'M' || g === 'MALE') formattedGender = 'male';
      else if (g === 'F' || g === 'FEMALE') formattedGender = 'female';
      else if (g === 'T' || g === 'TRANSGENDER') formattedGender = 'transgender';
      else formattedGender = 'other';
    }

    let result: any;
    try {
      result = await this.truidService.getEquifaxReport({
        name: app.borrower.fullName,
        pan_number: rawPan,
        mobile: app.borrower.mobile,
        consent: 'Y',
        dob: formattedDob,
        gender: formattedGender,
      });

      console.log(result,"result");
      
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException('Credit check service is temporarily unavailable.', HttpStatus.BAD_GATEWAY);
    }

    const creditData = result.data;
    const cibilScore = creditData.credit_score;

    await this.prisma.loanApplication.update({
      where: { id: applicationId },
      data: {
        equifaxScore: cibilScore,
        status: 'UNDERWRITING_REVIEW',
      },
    });

    return {
      success: true,
      score: cibilScore,
      data: {
        creditInfo:creditData,
        credit_score: creditData.credit_score,
        score_band: creditData.score_band,
        report_id: creditData.report_id,
        name: creditData.name,
        
      },
    };
  }
}
