import { Module } from '@nestjs/common';

import { ActivityModule } from '../activity/activity.module';
import { AuthModule } from '../auth/auth.module';
import { SessionModule } from '../session/session.module';
import { CoursesController } from './courses.controller';
import { DashboardController } from './dashboard.controller';
import { CoursesService } from './courses.service';
import { StudentController } from './student.controller';

@Module({
  imports: [AuthModule, SessionModule, ActivityModule],
  controllers: [CoursesController, DashboardController, StudentController],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}
