import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import type { OrderDetail, OrderSummary } from '@konzia/shared';
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
}
