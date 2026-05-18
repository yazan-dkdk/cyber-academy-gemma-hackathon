import { Controller, ForbiddenException, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';

import { ActivityService } from '../activity/activity.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { CoursesService } from './courses.service';

@Controller('dashboard')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(UserRole.STUDENT)
export class DashboardController {
  constructor(
    @Inject(CoursesService)
    private readonly coursesService: CoursesService,
    @Inject(ActivityService)
    private readonly activityService: ActivityService,
  ) {}

  @Get('summary')
  async getSummary(@CurrentUser() user: AuthenticatedUser) {
    this.assertActiveStudent(user);
    return this.coursesService.getStudentDashboardSummary(user.id);
  }

  @Get('recent-activity')
  async getRecentActivity(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ) {
    this.assertActiveStudent(user);
    return this.activityService.listRecentActivities(
      user.id,
      query.page ?? 1,
      query.pageSize ?? 20,
    );
  }

  @Get('my-courses')
  async getMyCourses(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ) {
    this.assertActiveStudent(user);
    return this.coursesService.listStudentCourses(
      user.id,
      query.page ?? 1,
      query.pageSize ?? 20,
    );
  }

  private assertActiveStudent(user: AuthenticatedUser) {
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Active student account required');
    }
  }
}
