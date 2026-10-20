import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  appearanceSchema,
  updateAppearanceRequestSchema,
  type Appearance,
  type UpdateAppearanceRequest,
} from '@pypr/validation';
import { ACCESS_COOKIE } from '../auth/auth.constants.js';
import { CurrentAuth } from '../auth/current-auth.decorator.js';
import type { AccessClaims } from '../auth/tokens.service.js';
import { apiSchema } from '../common/openapi-schema.js';
import { ZodBodyPipe } from '../common/zod-body.pipe.js';
import { AppearanceService } from './appearance.service.js';

@ApiTags('account')
@ApiCookieAuth(ACCESS_COOKIE)
@ApiResponse({ status: 401, description: 'Not signed in' })
@Controller('me/appearance')
export class AppearanceController {
  constructor(private readonly appearance: AppearanceService) {}

  @Get()
  @ApiOperation({ summary: "The app's theme and accent for this account (null = never chosen)" })
  @ApiResponse({ status: 200, schema: apiSchema(appearanceSchema) })
  get(@CurrentAuth() auth: AccessClaims): Promise<Appearance> {
    return this.appearance.get(auth.userId);
  }

  @Patch()
  @ApiOperation({ summary: "Change the app's theme and/or accent (never a resume's design)" })
  @ApiBody({ schema: apiSchema(updateAppearanceRequestSchema, 'input') })
  @ApiResponse({ status: 200, schema: apiSchema(appearanceSchema) })
  update(
    @CurrentAuth() auth: AccessClaims,
    @Body(new ZodBodyPipe(updateAppearanceRequestSchema)) body: UpdateAppearanceRequest,
  ): Promise<Appearance> {
    return this.appearance.update(auth.userId, body);
  }
}
