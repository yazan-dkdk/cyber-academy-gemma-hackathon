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

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { OpaqueIdParamPipe } from '../common/pipes/opaque-id-param.pipe';
import { ListCoursesQueryDto } from './dto/list-courses-query.dto';
import { UpdateLessonProgressDto } from './dto/update-lesson-progress.dto';
import { CoursesService } from './courses.service';

@Controller('courses')
export class CoursesController {
  constructor(
    @Inject(CoursesService)
    private readonly coursesService: CoursesService,
  ) {}

  @Get()
  async listPublishedCourses(@Query() query: ListCoursesQueryDto) {
    return this.coursesService.listPublishedCourses(query);
  }

  @Get(':courseId')
  async getPublishedCourseById(@Param('courseId', new OpaqueIdParamPipe()) courseId: string) {
    return this.coursesService.getPublishedCourseById(courseId);
  }

  @Post(':courseId/enroll')
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  async enroll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', new OpaqueIdParamPipe()) courseId: string,
  ) {
    this.assertActiveStudent(user);
    return this.coursesService.enroll(user.id, courseId);
  }

  @Get(':courseId/lessons/:lessonId')
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  async getLessonForStudent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', new OpaqueIdParamPipe()) courseId: string,
    @Param('lessonId', new OpaqueIdParamPipe()) lessonId: string,
  ) {
    this.assertActiveStudent(user);
    return this.coursesService.getLessonForStudent(user.id, courseId, lessonId, user.email);
  }

  @Post(':courseId/lessons/:lessonId/progress')
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  async updateLessonProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', new OpaqueIdParamPipe()) courseId: string,
    @Param('lessonId', new OpaqueIdParamPipe()) lessonId: string,
    @Body() body: UpdateLessonProgressDto,
  ) {
    this.assertActiveStudent(user);
    return this.coursesService.updateLessonProgress(
      user.id,
      courseId,
      lessonId,
      body,
    );
  }

  private assertActiveStudent(user: AuthenticatedUser) {
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Active student account required');
    }
  }
}
