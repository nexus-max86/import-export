import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  CancelOrderSchema,
  DecideAdjustmentSchema,
  ProposeAdjustmentSchema,
  RecordAdjustmentDecisionSchema,
  UpdateOrderStatusSchema,
  type OrderDetail,
  type OrderStatus,
  type OrderSummary,
} from '@konzia/shared';
import { ZodBody } from '../common/zod-body.pipe';
import type { AuthContext } from '../auth/auth.types';
import { Auth } from '../auth/decorators';
import { ForOrg, Org, type OrgContext } from '../tenancy/org-context';
import { OrdersService } from './orders.service';

@Controller()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get('orders')
  mine(@Auth() auth: AuthContext): Promise<OrderSummary[]> {
    return this.orders.listForCustomer(auth.userId);
  }

  @Get('orders/:id')
  get(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<OrderDetail> {
    return this.orders.getForCustomer(auth.userId, id);
  }

  @Get('org/orders')
  @ForOrg('order.view')
  listForOrg(@Auth() auth: AuthContext, @Org() org: OrgContext): Promise<OrderSummary[]> {
    return this.orders.listForOrg(auth.userId, org);
  }

  @Get('org/orders/:id')
  @ForOrg('order.view')
  getForOrg(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderDetail> {
    return this.orders.getForOrg(auth.userId, org, id);
  }

  @Post('org/orders/:id/status')
  @ForOrg('order.status.update')
  updateStatus(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(UpdateOrderStatusSchema)) body: { status: OrderStatus; note?: string | null },
  ): Promise<OrderDetail> {
    return this.orders.updateStatus(auth.userId, org, id, body.status, body.note ?? null);
  }

  @Post('org/orders/:id/cancel')
  @ForOrg('order.cancel')
  cancelByOrg(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(CancelOrderSchema)) body: { reason: string },
  ): Promise<OrderDetail> {
    return this.orders.cancelByOrg(auth.userId, org, id, body.reason);
  }

  @Post('org/orders/:id/adjustments')
  @ForOrg('order.adjustment.propose')
  propose(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(ProposeAdjustmentSchema)) body: { amountDelta: number; reason: string },
  ): Promise<OrderDetail> {
    return this.orders.proposeAdjustment(auth.userId, org, id, body.amountDelta, body.reason);
  }

  @Post('org/orders/:id/adjustments/:adjId/decision')
  @ForOrg('order.adjustment.propose')
  recordDecision(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('adjId', ParseUUIDPipe) adjId: string,
    @Body(new ZodBody(RecordAdjustmentDecisionSchema)) body: { accepted: boolean; note: string },
  ): Promise<OrderDetail> {
    return this.orders.recordAdjustmentDecision(
      auth.userId,
      org,
      id,
      adjId,
      body.accepted,
      body.note,
    );
  }

  @Post('orders/:id/adjustments/:adjId/decision')
  decide(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('adjId', ParseUUIDPipe) adjId: string,
    @Body(new ZodBody(DecideAdjustmentSchema)) body: { accepted: boolean },
  ): Promise<OrderDetail> {
    return this.orders.decideAdjustment(auth.userId, id, adjId, body.accepted);
  }

  @Post('orders/:id/cancel')
  cancelByCustomer(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(CancelOrderSchema)) body: { reason: string },
  ): Promise<OrderDetail> {
    return this.orders.cancelByCustomer(auth.userId, id, body.reason);
  }
}
