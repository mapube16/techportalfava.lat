import { Module } from '@nestjs/common';
import { DailyEntriesController } from './daily-entries.controller';
import { DailyEntriesService } from './daily-entries.service';

@Module({
  controllers: [DailyEntriesController],
  providers: [DailyEntriesService],
})
export class DailyEntriesModule {}
