import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { SoldDaysService } from './sold-days.service';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService, SoldDaysService],
})
export class ProjectsModule {}
