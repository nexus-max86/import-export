import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  RouteTemplateSchema,
  ShipmentSchema,
  TrackingEventSchema,
  UpdateShipmentSchema,
  type CustomerParcelTracking,
  type RouteTemplateInfo,
  type RouteTemplateInput,
  type ShipmentInfo,
  type ShipmentInput,
  type TrackingEventInput,
} from '@konzia/shared';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types';
import { Auth } from '../auth/decorators';
import { ZodBody } from '../common/zod-body.pipe';
import { ForOrg, Org, type OrgContext } from '../tenancy/org-context';
import { CustomerTrackingService } from './customer-tracking.service';
import { ShipmentsService } from './shipments.service';
import { TrackingService } from './tracking.service';

const ParcelIdsSchema = z.object({ parcelIds: z.array(z.uuid()).min(1).max(200) });
const ReasonSchema = z.object({ reason: z.string().trim().min(3, 'Indiquez un motif.').max(300) });

@Controller()
export class TrackingController {
  constructor(
    private readonly tracking: TrackingService,
    private readonly shipments: ShipmentsService,
    private readonly customer: CustomerTrackingService,
  ) {}

  /** Client : suivi des colis de SA commande (ses articles seulement). */
  @Get('orders/:id/tracking')
  orderTracking(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CustomerParcelTracking[]> {
    return this.customer.forOrder(auth.userId, id);
  }

  @Get('org/route-templates')
  @ForOrg('order.view')
  templates(@Auth() auth: AuthContext, @Org() org: OrgContext): Promise<RouteTemplateInfo[]> {
    return this.tracking.listTemplates(auth.userId, org);
  }

  @Post('org/route-templates')
  @ForOrg('shipment.manage')
  createTemplate(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Body(new ZodBody(RouteTemplateSchema)) body: RouteTemplateInput,
  ): Promise<RouteTemplateInfo> {
    return this.tracking.createTemplate(auth.userId, org, body);
  }

  @Get('org/shipments')
  @ForOrg('order.view')
  list(@Auth() auth: AuthContext, @Org() org: OrgContext): Promise<ShipmentInfo[]> {
    return this.shipments.list(auth.userId, org);
  }

  @Post('org/shipments')
  @ForOrg('shipment.manage')
  create(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Body(new ZodBody(ShipmentSchema)) body: ShipmentInput,
  ): Promise<ShipmentInfo> {
    return this.shipments.create(auth.userId, org, body);
  }

  @Get('org/shipments/:id')
  @ForOrg('order.view')
  get(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ShipmentInfo> {
    return this.shipments.get(auth.userId, org, id);
  }

  @Patch('org/shipments/:id')
  @ForOrg('shipment.manage')
  update(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(UpdateShipmentSchema)) body: Partial<ShipmentInput>,
  ): Promise<ShipmentInfo> {
    return this.shipments.update(auth.userId, org, id, body);
  }

  @Post('org/shipments/:id/parcels')
  @ForOrg('shipment.manage')
  addParcels(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(ParcelIdsSchema)) body: { parcelIds: string[] },
  ): Promise<ShipmentInfo> {
    return this.shipments.addParcels(auth.userId, org, id, body.parcelIds);
  }

  @Post('org/shipments/:id/parcels/:parcelId/remove')
  @ForOrg('shipment.manage')
  removeParcel(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('parcelId', ParseUUIDPipe) parcelId: string,
    @Body(new ZodBody(ReasonSchema)) body: { reason: string },
  ): Promise<ShipmentInfo> {
    return this.shipments.removeParcel(auth.userId, org, id, parcelId, body.reason);
  }

  @Post('org/shipments/:id/events')
  @ForOrg('tracking.record')
  shipmentEvent(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(TrackingEventSchema)) body: TrackingEventInput,
  ) {
    return this.shipments.recordEvent(auth.userId, org, id, body);
  }
}
