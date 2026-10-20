import { BadRequestException } from '@nestjs/common';
import { isTemplateId } from '@pypr/templates';

export { DEFAULT_TEMPLATE_ID } from '@pypr/templates';

export function assertKnownTemplate(templateId: string): void {
  if (!isTemplateId(templateId)) {
    throw new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid request body',
      issues: [{ path: 'content.template', message: 'Unknown template' }],
    });
  }
}
