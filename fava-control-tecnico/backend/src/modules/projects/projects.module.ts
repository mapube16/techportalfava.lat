import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { OrdersService } from './orders.service';
import { ProjectsService } from './projects.service';
import { SoldDaysService } from './sold-days.service';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService, SoldDaysService, OrdersService],
})
export class ProjectsModule {}
