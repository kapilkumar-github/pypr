import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { ZalidationPipe } from '../common/pipes/zalidation.pipe.js';
import { registerSchema, type RegisterInput } from '@pypr/validation';
import {
  type ApiResponse,
  createApiResponse,
} from '../common/types/api-response.type.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(
    @Body(new ZalidationPipe(registerSchema))
    input: RegisterInput,
  ): ApiResponse<null> {
    const request = this.authService.register(input);
    return createApiResponse(
      null,
      'Registered Sucessfully.',
      true,
      '/auth/login',
    );
  }
}
