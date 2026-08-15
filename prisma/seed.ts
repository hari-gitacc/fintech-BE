import { PrismaClient, Role, ApplicationStatus, DisbursalMode, RepaymentFrequency, RateType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const ENCRYPTION_KEY = process.env.DATABASE_ENCRYPTION_KEY || '12345678901234567890123456789012'; // 32 chars
const ALGORITHM = 'aes-256-gcm';

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${encrypted}:${authTag}`;
}

async function main() {
  // 1. Create Tenant
  const tenant1 = await prisma.tenant.upsert({
    where: { code: 'TENANT1' },
    update: {},
    create: {
      name: 'Alpha Finance',
      code: 'TENANT1',
    },
  });

  // 2. Create Users
  await prisma.user.upsert({
    where: { email: 'telecaller@tenant1.com' },
    update: {},
    create: {
      tenantId: tenant1.id,
      email: 'telecaller@tenant1.com',
      password: 'password123', // In a real app, hash this with bcrypt
      name: 'Rahul Telecaller',
      role: Role.TELECALLER,
    },
  });

  await prisma.user.upsert({
    where: { email: 'credit@tenant1.com' },
    update: {},
    create: {
      tenantId: tenant1.id,
      email: 'credit@tenant1.com',
      password: 'password123',
      name: 'Priya Credit Officer',
      role: Role.CREDIT_OFFICER,
    },
  });

  await prisma.user.upsert({
    where: { email: 'admin@tenant1.com' },
    update: {},
    create: {
      tenantId: tenant1.id,
      email: 'admin@tenant1.com',
      password: 'password123',
      name: 'Amit Admin',
      role: Role.DISBURSAL_ADMIN,
    },
  });

  // 3. Create Loan Products
  const product1 = await prisma.loanProduct.create({
    data: {
      tenantId: tenant1.id,
      name: 'Salaried Personal Loan',
      targetEmployment: 'SALARIED',
      minAmount: 50000,
      maxAmount: 500000,
      minTenure: 12,
      maxTenure: 60,
      repaymentFrequency: RepaymentFrequency.MONTHLY,
      rateType: RateType.REDUCING,
      baseInterestRate: 14.5,
      processingFeePercent: 2.0,
      maxAllowedFoir: 60.0,
      maxAllowedBounces: 2,
      minCreditScore: 650,
    },
  });

  const product2 = await prisma.loanProduct.create({
    data: {
      tenantId: tenant1.id,
      name: 'Thandal Weekly Micro-Loan',
      targetEmployment: 'SELF_EMPLOYED',
      minAmount: 5000,
      maxAmount: 50000,
      minTenure: 4,
      maxTenure: 24,
      repaymentFrequency: RepaymentFrequency.WEEKLY,
      rateType: RateType.FLAT,
      baseInterestRate: 24.0,
      processingFeePercent: 3.0,
      maxAllowedFoir: 50.0,
      maxAllowedBounces: 1,
      minCreditScore: 0,
    },
  });

  // 4. Create Borrowers & Applications
  const borrower1 = await prisma.borrower.create({
    data: {
      tenantId: tenant1.id,
      fullName: 'Ramesh Kumar',
      mobile: '9876543210',
      encryptedPan: encrypt('ABCDE1234F'),
    },
  });
  
  await prisma.loanApplication.create({
    data: {
      tenantId: tenant1.id,
      borrowerId: borrower1.id,
      productId: product1.id,
      status: ApplicationStatus.DRAFT,
      requestedAmount: 100000,
    },
  });

  const borrower2 = await prisma.borrower.create({
    data: {
      tenantId: tenant1.id,
      fullName: 'Suresh Raina',
      mobile: '9876543211',
      encryptedPan: encrypt('BCDEF2345G'),
      aadhaarMasked: 'XXXXXXXX1234',
      dob: '1990-01-01',
      gender: 'M',
    },
  });

  await prisma.loanApplication.create({
    data: {
      tenantId: tenant1.id,
      borrowerId: borrower2.id,
      productId: product1.id,
      status: ApplicationStatus.OKYC_COMPLETED,
      panVerified: true,
      panAadhaarLinked: true,
      panTaxCompliant: true,
      okycVerified: true,
      requestedAmount: 150000,
    },
  });

  const borrower3 = await prisma.borrower.create({
    data: {
      tenantId: tenant1.id,
      fullName: 'Deepak Sharma',
      mobile: '9876543212',
      encryptedPan: encrypt('CDEFG3456H'),
      aadhaarMasked: 'XXXXXXXX5678',
    },
  });

  await prisma.loanApplication.create({
    data: {
      tenantId: tenant1.id,
      borrowerId: borrower3.id,
      productId: product2.id,
      status: ApplicationStatus.UNDERWRITING_REVIEW,
      panVerified: true,
      okycVerified: true,
      requestedAmount: 20000,
      equifaxScore: 710,
      verifiedMonthlyIncome: 45000,
      reconciledMonthlyEmi: 12000,
    },
  });

  const borrower4 = await prisma.borrower.create({
    data: {
      tenantId: tenant1.id,
      fullName: 'Meena Kumari',
      mobile: '9876543213',
      encryptedPan: encrypt('DEFGH4567I'),
      aadhaarMasked: 'XXXXXXXX9012',
    },
  });

  await prisma.loanApplication.create({
    data: {
      tenantId: tenant1.id,
      borrowerId: borrower4.id,
      productId: product1.id,
      status: ApplicationStatus.APPROVED,
      panVerified: true,
      okycVerified: true,
      requestedAmount: 300000,
      approvedAmount: 300000,
      tenure: 36,
      calculatedInstallment: 10333.33, // Approx
      pennyDropVerified: true,
    },
  });

  console.log('Seed data inserted successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
