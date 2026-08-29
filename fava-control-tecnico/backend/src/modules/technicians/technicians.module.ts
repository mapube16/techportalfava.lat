import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { NotificationsService } from '../../common/notifications/notifications.service';
import { WeeklyNotesModule } from '../weekly-notes/weekly-notes.module';
import { TechniciansController } from './technicians.controller';
import { TechniciansService } from './technicians.service';

@Module({
  imports: [WeeklyNotesModule],
  controllers: [TechniciansController],
  providers: [TechniciansService, AuditService, NotificationsService],
})
export class TechniciansModule {}
