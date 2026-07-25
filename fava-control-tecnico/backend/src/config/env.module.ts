import { Global, Module } from '@nestjs/common';
import { EnvService } from './env';

// ponytail: sustituye a ConfigModule. `env` ya esta validado por zod y congelado;
// ConfigService encima solo anadiria una capa de lookup por string sin tipos.
@Global()
@Module({
  providers: [EnvService],
  exports: [EnvService],
})
export class EnvModule {}
