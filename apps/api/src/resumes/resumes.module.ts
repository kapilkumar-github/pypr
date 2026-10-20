import { Module } from '@nestjs/common';
import { ResumePhotosController } from './resume-photos.controller.js';
import { ResumePhotosService } from './resume-photos.service.js';
import { ResumesController } from './resumes.controller.js';
import { ResumesService } from './resumes.service.js';

@Module({
  controllers: [ResumesController, ResumePhotosController],
  providers: [ResumesService, ResumePhotosService],
})
export class ResumesModule {}
