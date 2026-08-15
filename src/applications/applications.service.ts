import { Injectable, HttpException, HttpStatus, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class ApplicationsService {
  constructor(private prisma: PrismaService) {}

  async create(createApplicationDto: any) {
    // --- Input Validation ---
    const { name, mobile, pan, aadhaar, address, requestedAmount } = createApplicationDto;

    if (!name || name.trim().length < 2) {
      throw new BadRequestException('Full name is required (minimum 2 characters).');
    }
    if (!mobile || !/^\d{10}$/.test(mobile)) {
      throw new BadRequestException('A valid 10-digit mobile number is required.');
    }
    if (!pan || !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.toUpperCase())) {
      throw new BadRequestException('A valid 10-character PAN is required (e.g. ABCDE1234F).');
    }
    if (!aadhaar || !/^\d{12}$/.test(aadhaar)) {
      throw new BadRequestException('A valid 12-digit Aadhaar number is required.');
    }
    if (!address || address.trim().length < 5) {
      throw new BadRequestException('A valid address is required.');
    }

    const parsedAmount = Number(requestedAmount);
    if (!parsedAmount || parsedAmount <= 0) {
      throw new BadRequestException('Requested loan amount must be a positive number.');
    }

    // --- Tenant Lookup ---
    const tenant = await this.prisma.tenant.findFirst();
    if (!tenant) {
      throw new HttpException(
        'No tenants found in the database. Please contact support.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // Encrypt PAN (Base64 for now — production should use AES-256)
    const encryptedPan = Buffer.from(pan.toUpperCase()).toString('base64');

    // Mask Aadhaar for storage — NEVER store full Aadhaar
    const aadhaarMasked = `XXXXXXXX${aadhaar.slice(-4)}`;

    const borrower = await this.prisma.borrower.create({
      data: {
        tenantId: tenant.id,
        fullName: name.trim(),
        mobile: mobile,
        encryptedPan: encryptedPan,
        aadhaarMasked: aadhaarMasked,
        address: { text: address },
      },
    });

    const application = await this.prisma.loanApplication.create({
      data: {
        tenantId: tenant.id,
        borrowerId: borrower.id,
        requestedAmount: parsedAmount,
        status: 'DRAFT',
      },
    });

    return {
      applicationId: application.id,
      borrowerName: borrower.fullName,
      requestedAmount: application.requestedAmount,
    };
  }
}
