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
  /**
   * El cliente que expone los delegados de modelo (`.user`, `.dailyEntry`...).
   *
   * NO es `this`: Prisma 7 envuelve la instancia en un Proxy y los delegados solo
   * existen a traves de el. Dentro de un getter o de un metodo de la clase, `this` es
   * el objeto envuelto, y `this.user` sale `undefined` — con TypeScript contento,
   * porque los tipos no ven la diferencia. Dentro del constructor `this` SI es el
   * Proxy, asi que se guarda ahi.
   */
  private readonly delegados: PrismaClient;

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
    this.delegados = this;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Cliente sin transaccion: guard y lookups previos al contexto RLS. */
  get base(): PrismaClient {
    return this.delegados;
  }

  /** Tx de la peticion si existe; si no, el cliente base. Lo usan los servicios. */
  get client(): TxClient {
    return als.getStore() ?? this.delegados;
  }
}
