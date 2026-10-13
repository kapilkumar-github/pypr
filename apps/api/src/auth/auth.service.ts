import { ConflictException, Injectable } from '@nestjs/common';
import { type RegisterInput } from '@pypr/validation';
import { PrismaService } from '../prisma/prisma.service.js';
import bcrypt from 'bcrypt';
import { AuthQueries } from './auth.queries.js';

@Injectable()
export class AuthService {
  constructor(private readonly prismaService: PrismaService) {}
  async register(input: RegisterInput) {
    const exitingUser = await this.prismaService.user.findUnique({
      where: { email: input.email },
    });

    if (exitingUser) {
      throw new ConflictException('Email is already registered.');
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await this.prismaService.user.create(
      AuthQueries.prepRegisterUser(input, passwordHash),
    );

    return user;
  }
}
