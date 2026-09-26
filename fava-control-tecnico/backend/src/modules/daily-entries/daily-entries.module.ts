import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { AdminDailyEntriesController, DailyEntriesController } from './daily-entries.controller';
import { DailyEntriesService } from './daily-entries.service';
import { GastosController } from './gastos.controller';
import { GastosService } from './gastos.service';

/**
 * Los gastos del dia viven aqui y no en el modulo de notas (GASTO-01): su dueño es la
 * JORNADA — se capturan con el dia, se bloquean con el dia y se borran con el dia. La
 * nota los LEE al imprimirse; no los posee.
 */
@Module({
  controllers: [DailyEntriesController, AdminDailyEntriesController, GastosController],
  // `AuditService` en `providers`, como en weekly-notes: la admin deja rastro al escribir.
  providers: [DailyEntriesService, GastosService, AuditService],
})
export class DailyEntriesModule {}
