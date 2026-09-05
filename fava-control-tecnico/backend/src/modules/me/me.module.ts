import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { MisKpisController } from './mis-kpis.controller';
import { MisKpisService } from './mis-kpis.service';
import { PendientesController } from './pendientes.controller';
import { PendientesService } from './pendientes.service';

@Module({
  controllers: [MeController, MisKpisController, PendientesController],
  providers: [MisKpisService, PendientesService],
})
export class MeModule {}
