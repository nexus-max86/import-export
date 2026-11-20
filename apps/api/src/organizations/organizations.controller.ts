import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ChangeRoleSchema,
  CreateOrganizationSchema,
  InviteMemberSchema,
  TokenSchema,
  UpdateOrganizationSchema,
  type CreateOrganizationInput,
  type InviteMemberInput,
  type MemberInfo,
  type MembershipSummary,
  type OrgRole,
  type UpdateOrganizationInput,
} from '@konzia/shared';
import type { AuthContext } from '../auth/auth.types';
import { Auth } from '../auth/decorators';
import { RequireVerifiedEmail } from '../auth/verified-email.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { ForOrg, Org, type OrgContext } from '../tenancy/org-context';
import { OrganizationsService } from './organizations.service';

@Controller()
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Post('organizations')
  @RequireVerifiedEmail()
  create(
    @Auth() auth: AuthContext,
    @Body(new ZodBody(CreateOrganizationSchema)) body: CreateOrganizationInput,
  ): Promise<MembershipSummary> {
    return this.orgs.create(auth.userId, body);
  }

  @Get('organizations/mine')
  mine(@Auth() auth: AuthContext): Promise<MembershipSummary[]> {
    return this.orgs.mine(auth.userId);
  }

  @Get('org')
  @ForOrg()
  current(@Auth() auth: AuthContext, @Org() org: OrgContext) {
    return this.orgs.get(auth.userId, org);
  }

  @Patch('org')
  @HttpCode(204)
  @ForOrg('org.settings.edit')
  update(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Body(new ZodBody(UpdateOrganizationSchema)) body: UpdateOrganizationInput,
  ): Promise<void> {
    return this.orgs.update(auth.userId, org, body);
  }

  @Get('org/members')
  @ForOrg()
  members(@Auth() auth: AuthContext, @Org() org: OrgContext): Promise<MemberInfo[]> {
    return this.orgs.members(auth.userId, org);
  }

  @Post('org/invitations')
  @HttpCode(204)
  @ForOrg('org.members.manage')
  invite(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Body(new ZodBody(InviteMemberSchema)) body: InviteMemberInput,
  ): Promise<void> {
    return this.orgs.invite(auth.userId, org, body);
  }

  @Patch('org/members/:id')
  @HttpCode(204)
  @ForOrg('org.members.manage')
  changeRole(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(ChangeRoleSchema)) body: { role: OrgRole },
  ): Promise<void> {
    return this.orgs.changeRole(auth.userId, org, id, body.role);
  }

  @Delete('org/members/:id')
  @HttpCode(204)
  @ForOrg('org.members.manage')
  remove(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.orgs.removeMember(auth.userId, org, id);
  }

  @Post('invitations/accept')
  @RequireVerifiedEmail()
  accept(
    @Auth() auth: AuthContext,
    @Body(new ZodBody(TokenSchema)) body: { token: string },
  ): Promise<MembershipSummary> {
    return this.orgs.acceptInvitation(auth.userId, body.token);
  }
}
