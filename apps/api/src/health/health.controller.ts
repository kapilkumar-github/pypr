import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service.js';
import {
  createApiResponse,
  type ApiResponse,
} from '../common/types/api-response.type.js';
import { HealthResponseDTO } from './dto/health-response.dto.js';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async checkHealth(): Promise<ApiResponse<HealthResponseDTO>> {
    const health = await this.healthService.checkHealth();
    return createApiResponse(health);
  }
}
