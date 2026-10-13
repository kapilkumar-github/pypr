import { RegisterInput } from '@pypr/validation';
import { Prisma } from '../generated/prisma/client.js';

const prepRegisterUser = (
  input: RegisterInput,
  passwordHash: string,
): Prisma.UserCreateArgs => ({
  data: {
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    timezone: input.timezone,
    identityProviders: {
      create: {
        provider: 'LOCAL',
        providerUserId: input.email,
      },
    },
    credentials: {
      create: {
        passwordHash,
      },
    },
  },
});

export const AuthQueries = { prepRegisterUser };
