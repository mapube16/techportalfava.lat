import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { env } from '../../config/env';

/** Cliente dentro de la transaccion-por-peticion: sin control de conexion ni tx anidada. */
export type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

/**
 * Transporta el tx de la peticion actual sin pasarlo por parametro por todas las
 * capas. Lo rellena RlsInterceptor (Plan 01-02); olvidarse es imposible.
 */
export const als = new AsyncLocalStorage<TxClient>();

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      // Prisma 7: el pool se configura aqui. Un ?connection_limit= en la URL se
      // ignora en silencio.
      adapter: new PrismaPg({
        connectionString: env.DATABASE_URL,
        max: 10,
        connectionTimeoutMillis: 5_000,
      }),
      // Los defaults (5 s / 2 s) matan handlers lentos con P2028.
      transactionOptions: { timeout: 10_000, maxWait: 5_000 },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Cliente sin transaccion: guard y lookups previos al contexto RLS. */
  get base(): PrismaClient {
    return this;
  }

  /** Tx de la peticion si existe; si no, el cliente base. Lo usan los servicios. */
  get client(): TxClient {
    return als.getStore() ?? this;
  }
}
