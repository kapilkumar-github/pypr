import { Injectable, NotFoundException } from '@nestjs/common';
import type { Appearance, UpdateAppearanceRequest } from '@pypr/validation';
import { PrismaService } from '../database/prisma.service.js';

const SELECT = { themePreference: true, appAccentColor: true } as const;

/** The signed-in user's app appearance (decision D28). Never touches any resume. */
@Injectable()
export class AppearanceService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<Appearance> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: SELECT });
    if (!user) throw new NotFoundException('User not found');
    return toAppearance(user);
  }

  /** Changes only the fields given, so a theme change keeps the accent and vice versa. */
  async update(userId: string, patch: UpdateAppearanceRequest): Promise<Appearance> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(patch.theme !== undefined && { themePreference: patch.theme }),
        ...(patch.accentColor !== undefined && { appAccentColor: patch.accentColor }),
      },
      select: SELECT,
    });
    return toAppearance(user);
  }
}

function toAppearance(user: {
  themePreference: Appearance['theme'];
  appAccentColor: string | null;
}): Appearance {
  return { theme: user.themePreference, accentColor: user.appAccentColor };
}
