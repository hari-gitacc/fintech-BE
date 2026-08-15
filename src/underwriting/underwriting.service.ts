import { Injectable, BadRequestException } from '@nestjs/common';

export interface BankStatementAnalysis {
  verifiedMonthlyIncome: number;
  averageMonthlyBalance: number;
  totalBouncesLast6Months: number;
  debits: { date: string; amount: number; description: string }[];
}

@Injectable()
export class UnderwritingService {
  
  /**
   * Mock Bank Statement Analyzer
   * Simulates parsing a 6-month bank statement PDF and extracting financials.
   */
  async analyzeBankStatement(pdfUrl: string): Promise<BankStatementAnalysis> {
    // In production, this would call an OCR/Parsing ML service.
    // Returning deterministic mock data for demo purposes.
    return {
      verifiedMonthlyIncome: 55000,
      averageMonthlyBalance: 24000,
      totalBouncesLast6Months: 1,
      debits: [
        { date: '2026-08-01', amount: 12000, description: 'EMI HDFC BANK' },
        { date: '2026-08-10', amount: 3000, description: 'BAJAJ FINSERV EMI' },
        { date: '2026-08-15', amount: 1500, description: 'UTILITY BILL' },
      ],
    };
  }

  /**
   * Reconciliation Engine
   * Matches Equifax trade lines with Bank Debits to avoid double counting EMIs.
   */
  reconcileObligations(
    equifaxTradeLines: { amount: number; institution: string }[],
    bankDebits: { amount: number; description: string }[]
  ): number {
    let reconciledTotalEmi = 0;

    // A very simple fuzzy matching logic. 
    // If an Equifax EMI is within 5% of a bank debit, we consider them matching 
    // and count it only once.
    
    for (const tradeLine of equifaxTradeLines) {
      let matched = false;
      for (const debit of bankDebits) {
        const diffPercent = Math.abs(tradeLine.amount - debit.amount) / tradeLine.amount;
        if (diffPercent <= 0.05) {
          matched = true;
          break;
        }
      }
      
      // If matched, we don't double count. If not matched, we still add the trade line 
      // because the borrower might be paying via cash or a different bank account.
      reconciledTotalEmi += tradeLine.amount;
    }

    // Add any bank debits that look like EMIs but aren't in Equifax 
    // (e.g. un-reported private lenders)
    for (const debit of bankDebits) {
      if (debit.description.includes('EMI') || debit.description.includes('FINANCE')) {
        let matched = false;
        for (const tradeLine of equifaxTradeLines) {
          const diffPercent = Math.abs(tradeLine.amount - debit.amount) / tradeLine.amount;
          if (diffPercent <= 0.05) {
            matched = true;
            break;
          }
        }
        if (!matched) {
          reconciledTotalEmi += debit.amount;
        }
      }
    }

    return reconciledTotalEmi;
  }

  /**
   * FOIR Calculator
   * FOIR = [(Reconciled Monthly Debits + Proposed Installment) / Verified Net Income] * 100
   */
  calculateFoir(
    reconciledEmi: number,
    proposedInstallment: number,
    verifiedMonthlyIncome: number
  ): number {
    if (verifiedMonthlyIncome <= 0) return 100.0;
    
    const foir = ((reconciledEmi + proposedInstallment) / verifiedMonthlyIncome) * 100;
    return parseFloat(foir.toFixed(2));
  }
}
