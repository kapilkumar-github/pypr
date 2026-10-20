import { Module } from '@nestjs/common';
import { ResumeImportController } from './resume-import.controller.js';
import { ResumeImportService } from './resume-import.service.js';

@Module({
  controllers: [ResumeImportController],
  providers: [ResumeImportService],
})
export class ResumeImportModule {}
