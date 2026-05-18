import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

export type PrismaRunner = PrismaService | Prisma.TransactionClient;
