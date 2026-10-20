import { Module } from '@nestjs/common';
import { AppearanceController } from './appearance.controller.js';
import { AppearanceService } from './appearance.service.js';

@Module({
  controllers: [AppearanceController],
  providers: [AppearanceService],
})
export class AppearanceModule {}
