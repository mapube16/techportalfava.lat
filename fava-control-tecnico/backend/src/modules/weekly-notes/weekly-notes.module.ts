import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { WeeklyNotesController } from './weekly-notes.controller';
import { WeeklyNotesService } from './weekly-notes.service';

@Module({
  controllers: [WeeklyNotesController],
  providers: [WeeklyNotesService, AuditService],
  exports: [WeeklyNotesService],
})
export class WeeklyNotesModule {}
