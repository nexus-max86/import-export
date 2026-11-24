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
  Query,
} from '@nestjs/common';
import {
  DeclineRequestSchema,
  ManagedRequestSchema,
  OrgRequestPageQuerySchema,
  type OrgRequestPage,
  type OrgRequestPageQuery,
  RequestItemSchema,
  SendRequestSchema,
  UpdateRequestItemSchema,
  type ManagedRequestInput,
  type OrgRequestSummary,
  type RequestDetail,
  type RequestItemInput,
  type RequestSummary,
  type SendRequestInput,
  type UpdateRequestItemInput,
} from '@konzia/shared';
import type { AuthContext } from '../auth/auth.types';
import { Auth } from '../auth/decorators';
import { RequireVerifiedEmail } from '../auth/verified-email.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { ForOrg, Org, type OrgContext } from '../tenancy/org-context';
import { RequestsService } from './requests.service';

@Controller()
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  // --- Client ---
  @Get('requests')
  listMine(@Auth() auth: AuthContext): Promise<RequestSummary[]> {
    return this.requests.listMine(auth.userId);
  }

  @Get('requests/draft')
  draft(@Auth() auth: AuthContext): Promise<RequestDetail | null> {
    return this.requests.currentDraft(auth.userId);
  }

  @Post('requests/draft/items')
  addItem(
    @Auth() auth: AuthContext,
    @Body(new ZodBody(RequestItemSchema)) body: RequestItemInput,
  ): Promise<RequestDetail> {
    return this.requests.addToDraft(auth.userId, body);
  }

  @Get('requests/:id')
  get(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<RequestDetail> {
    return this.requests.getForCustomer(auth.userId, id);
  }

  @Patch('requests/:id/items/:itemId')
  updateItem(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body(new ZodBody(UpdateRequestItemSchema)) body: UpdateRequestItemInput,
  ): Promise<RequestDetail> {
    return this.requests.updateItem(auth.userId, id, itemId, body);
  }

  @Delete('requests/:id/items/:itemId')
  removeItem(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<RequestDetail> {
    return this.requests.removeItem(auth.userId, id, itemId);
  }

  @Post('requests/:id/send')
  @RequireVerifiedEmail()
  send(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(SendRequestSchema)) body: SendRequestInput,
  ): Promise<RequestDetail> {
    return this.requests.send(auth.userId, id, body);
  }

  @Post('requests/:id/cancel')
  cancel(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RequestDetail> {
    return this.requests.cancel(auth.userId, id);
  }

  // --- Commissionnaire ---
  @Get('org/requests')
  @ForOrg('request.view')
  listForOrg(@Auth() auth: AuthContext, @Org() org: OrgContext): Promise<OrgRequestSummary[]> {
    return this.requests.listForOrg(auth.userId, org);
  }

  @Get('org/requests/page')
  @ForOrg('request.view')
  pageForOrg(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Query(new ZodBody(OrgRequestPageQuerySchema)) q: OrgRequestPageQuery,
  ): Promise<OrgRequestPage> {
    return this.requests.pageForOrg(auth.userId, org, q);
  }

  @Post('org/requests')
  @ForOrg('request.create_for_managed')
  createManaged(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Body(new ZodBody(ManagedRequestSchema)) body: ManagedRequestInput,
  ): Promise<{ id: string }> {
    return this.requests.createManaged(auth.userId, org, body);
  }

  @Get('org/requests/:id')
  @ForOrg('request.view')
  getForOrg(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RequestDetail> {
    return this.requests.getForOrg(auth.userId, org, id);
  }

  @Post('org/requests/:id/decline')
  @HttpCode(204)
  @ForOrg('request.decline')
  decline(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(DeclineRequestSchema)) body: { reason: string },
  ): Promise<void> {
    return this.requests.decline(auth.userId, org, id, body.reason);
  }
}
