import { Controller, Get, Param, ParseUUIDPipe, Post, Query, Body, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { RequireAdminMfa } from '../common/decorators/admin-mfa.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminMfaGuard } from '../common/guards/admin-mfa.guard';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { ChangeRoleDto } from './dto/change-role.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(AuthenticatedGuard, RolesGuard, AdminMfaGuard)
@Roles(UserRole.ADMIN)
@RequireAdminMfa()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async listUsers(@Query() query: ListUsersQueryDto) {
    return this.usersService.listUsers(query);
  }

  @Get(':id')
  async getUserById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.usersService.getUserById(id);
  }

  @Post(':id/suspend')
  async suspendUser(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.usersService.suspendUser(actor.id, id);
  }

  @Post(':id/ban')
  async banUser(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.usersService.banUser(actor.id, id);
  }

  @Post(':id/reactivate')
  async reactivateUser(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.usersService.reactivateUser(actor.id, id);
  }

  @Post(':id/role')
  async changeRole(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ChangeRoleDto,
  ) {
    return this.usersService.changeRole(actor.id, id, body.role);
  }
}
