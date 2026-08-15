import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';

@Injectable()
export class TruIdService {
  private apiClient: AxiosInstance;

  constructor() {
    this.apiClient = axios.create({
      baseURL: 'https://service-api.truid.one/api/v1',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${process.env.TRUID_MERCHANT_ID || 'your-merchant-id'}:${process.env.TRUID_SECRET_KEY || 'your-secret-key'}`).toString('base64')}`
      },
    });

    this.apiClient.interceptors.request.use((config) => {
      config.headers['X-Request-Id'] = crypto.randomUUID().replace(/-/g, '');
      config.headers['X-Timestamp'] = Math.floor(Date.now() / 1000).toString();
      return config;
    });

    this.apiClient.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          const { status, data } = error.response;
          let message = data?.message || 'TruID API Error';
          if (data?.errors) {
            const errorDetails = Object.values(data.errors).flat().join(' ');
            message += ` ${errorDetails}`;
          }
          
          if (status === 402) throw new HttpException(`Insufficient balance: ${message}`, HttpStatus.PAYMENT_REQUIRED);
          if (status === 409) throw new HttpException(`Conflict: ${message}`, HttpStatus.CONFLICT);
          if (status === 429) throw new HttpException(`Rate limit exceeded: ${message}`, HttpStatus.TOO_MANY_REQUESTS);
          if (status >= 500) throw new HttpException(`Upstream TruID Error: ${message}`, HttpStatus.BAD_GATEWAY);
          
          throw new HttpException(message, status);
        }
        throw new HttpException('TruID Service Unavailable', HttpStatus.SERVICE_UNAVAILABLE);
      }
    );
  }

  async verifyPanDetailed(panNumber: string, name?: string) {
    const response = await this.apiClient.post('/services/kyc/pan-detailed', {
      pan_number: panNumber,
      name,
    });
    return response.data;
  }

  async generateOkycOtp(aadhaarNumber: string) {
    const response = await this.apiClient.post('/services/okyc/generate-otp', {
      aadhaar_number: aadhaarNumber, // Backend uses the full number, but NEVER stores it.
    });
    return response.data;
  }

  async getOkycResult(sessionId: string, otp: string) {
    const response = await this.apiClient.post('/services/okyc/get-result', {
      session_id: sessionId,
      otp: otp,
    });
    return response.data;
  }

  async getEquifaxReport(payload: { name: string; pan_number: string; mobile: string; consent: string; gender?: string; dob?: string }) {
    const response = await this.apiClient.post('/services/credit/equifax-report', payload);
    return response.data;
  }

  async verifyPennyDrop(accountNumber: string, ifsc: string, name: string) {
    const response = await this.apiClient.post('/services/bank/penny-drop', {
      account_number: accountNumber,
      ifsc: ifsc,
      name: name,
    });
    return response.data;
  }
}
