import { Controller, Get } from '@nestjs/common';
import type { OrgOverview } from '@konzia/shared';
import type { AuthContext } from '../auth/auth.types';
import { Auth } from '../auth/decorators';
import { ForOrg, Org, type OrgContext } from '../tenancy/org-context';
import { OverviewService } from './overview.service';

@Controller('org/overview')
export class OverviewController {
  constructor(private readonly overview: OverviewService) {}

  /** Vue générale : tout membre ; les montants seulement pour les rôles qui voient les paiements. */
  @Get()
  @ForOrg('order.view')
  get(@Auth() auth: AuthContext, @Org() org: OrgContext): Promise<OrgOverview> {
    return this.overview.get(auth.userId, org);
  }
}
