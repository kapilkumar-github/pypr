import { Injectable } from '@nestjs/common';
import { HealthResponseDTO } from './dto/health-response.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async checkHealth(): Promise<HealthResponseDTO> {
    const db = await this.checkDatabase();
    return { status: 'ok', service: 'pypr-api', db };
  }

  async checkDatabase() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { database: 'connected' };
  }
}
