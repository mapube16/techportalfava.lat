import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { NotificationsService } from '../../common/notifications/notifications.service';
import { WeeklyNotesController } from './weekly-notes.controller';
import { WeeklyNotesService } from './weekly-notes.service';

@Module({
  controllers: [WeeklyNotesController],
  // Sin `NotificationsModule`: `AuditService` sienta el precedente de listar el
  // servicio compartido en `providers` del que lo usa.
  providers: [WeeklyNotesService, AuditService, NotificationsService],
  exports: [WeeklyNotesService],
})
export class WeeklyNotesModule {}
