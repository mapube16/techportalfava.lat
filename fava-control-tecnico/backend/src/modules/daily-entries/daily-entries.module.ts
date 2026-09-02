import { Module } from '@nestjs/common';
import { DailyEntriesController } from './daily-entries.controller';
import { DailyEntriesService } from './daily-entries.service';
import { GastosController } from './gastos.controller';
import { GastosService } from './gastos.service';

/**
 * Los gastos del dia viven aqui y no en el modulo de notas (GASTO-01): su dueño es la
 * JORNADA — se capturan con el dia, se bloquean con el dia y se borran con el dia. La
 * nota los LEE al imprimirse; no los posee.
 */
@Module({
  controllers: [DailyEntriesController, GastosController],
  providers: [DailyEntriesService, GastosService],
})
export class DailyEntriesModule {}
