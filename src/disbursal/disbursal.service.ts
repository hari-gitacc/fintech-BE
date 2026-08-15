import { Injectable, BadRequestException } from '@nestjs/common';
import { DisbursalMode } from '@prisma/client';

@Injectable()
export class DisbursalService {
  
  /**
   * Processes the disbursal and enforces Income Tax Act regulations.
   */
  async processDisbursal(
    applicationId: string, 
    amount: number, 
    mode: DisbursalMode,
    details: { voucherNo?: string; chequeNo?: string; agentName?: string }
  ) {
    // TAX GUARDRAIL: Section 269SS of the Income Tax Act
    if (mode === DisbursalMode.CASH && amount > 20000) {
      throw new BadRequestException(
        'Income Tax Act Violation: Disbursements exceeding ₹20,000 cannot be in cash. Select Cheque or Bank Transfer.'
      );
    }

    if (mode === DisbursalMode.CASH && !details.voucherNo) {
      throw new BadRequestException('Cash disbursal requires a Voucher Number.');
    }

    if (mode === DisbursalMode.CHEQUE && !details.chequeNo) {
      throw new BadRequestException('Cheque disbursal requires a Cheque Number.');
    }

    // In a real system, this would update the LoanApplication status to DISBURSED,
    // trigger accounting entries, and notify the borrower.

    return {
      success: true,
      message: 'Disbursal processed successfully in compliance with regulations.',
      applicationId,
      disbursedAmount: amount,
      mode,
    };
  }
}
