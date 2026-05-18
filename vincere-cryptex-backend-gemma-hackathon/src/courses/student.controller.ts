import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';

import { ActivityService } from '../activity/activity.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { OpaqueIdParamPipe } from '../common/pipes/opaque-id-param.pipe';
import { CoursesService } from './courses.service';
import { ListCoursesQueryDto } from './dto/list-courses-query.dto';
import { UpdateLessonProgressDto } from './dto/update-lesson-progress.dto';

@Controller('student')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(UserRole.STUDENT)
export class StudentController {
  constructor(
    @Inject(CoursesService)
    private readonly coursesService: CoursesService,
    @Inject(ActivityService)
    private readonly activityService: ActivityService,
  ) {}

  @Get('courses')
  async listCourses(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListCoursesQueryDto,
  ) {
    this.assertActiveStudent(user);
    return this.coursesService.listStudentPublishedCourses(user.id, query);
  }

  @Get('courses/:courseId')
  async getCourseDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', new OpaqueIdParamPipe()) courseId: string,
  ) {
    this.assertActiveStudent(user);
    return this.coursesService.getStudentCourseDetail(user.id, courseId);
  }

  @Get('dashboard')
  async getDashboard(@CurrentUser() user: AuthenticatedUser) {
    this.assertActiveStudent(user);
    return this.coursesService.getStudentDashboardSummary(user.id);
  }

  @Post('courses/:courseId/enroll')
  async enroll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', new OpaqueIdParamPipe()) courseId: string,
  ) {
    this.assertActiveStudent(user);
    return this.coursesService.enroll(user.id, courseId);
  }

  @Get('courses/:courseId/lessons/:lessonId')
  async getLesson(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', new OpaqueIdParamPipe()) courseId: string,
    @Param('lessonId', new OpaqueIdParamPipe()) lessonId: string,
  ) {
    this.assertActiveStudent(user);
    return this.coursesService.getLessonForStudent(user.id, courseId, lessonId, user.email);
  }

  @Post('courses/:courseId/lessons/:lessonId/progress')
  async updateProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', new OpaqueIdParamPipe()) courseId: string,
    @Param('lessonId', new OpaqueIdParamPipe()) lessonId: string,
    @Body() body: UpdateLessonProgressDto,
  ) {
    this.assertActiveStudent(user);
    return this.coursesService.updateLessonProgress(user.id, courseId, lessonId, body);
  }

  @Get('continue-learning')
  async getContinueLearning(@CurrentUser() user: AuthenticatedUser) {
    this.assertActiveStudent(user);
    return this.coursesService.getContinueLearning(user.id);
  }

  @Get('activity')
  async getActivity(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ) {
    this.assertActiveStudent(user);
    return this.activityService.listStudentActivity(
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
