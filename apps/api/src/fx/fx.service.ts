import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  formatRate,
  parseRate,
  type CreateRateInput,
  type FxPair,
  type RateInfo,
} from '@konzia/shared';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantTx } from '../tenancy/tenant-db.service';

export interface CurrentRate {
  id: string;
  pair: FxPair;
  /** Taux entier à 8 décimales (voir RATE_SCALE). */
  scaled: bigint;
  source: string;
  validFrom: Date;
}

function toInfo(r: {
  id: string;
  pair: string;
  rate: { toFixed(n: number): string };
  source: string;
  validFrom: Date;
}): RateInfo {
  return {
    id: r.id,
    pair: r.pair as FxPair,
    rate: formatRate(parseRate(r.rate.toFixed(8))!),
    source: r.source,
    validFrom: r.validFrom.toISOString(),
  };
}

@Injectable()
export class FxService {
  constructor(
    private readonly system: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Taux en vigueur (le plus récent déjà valide) pour une paire, dans la transaction donnée. */
  async current(tx: TenantTx | PrismaService, pair: FxPair): Promise<CurrentRate> {
    const r = await tx.exchangeRate.findFirst({
      where: { pair, validFrom: { lte: new Date() } },
      orderBy: { validFrom: 'desc' },
      select: { id: true, pair: true, rate: true, source: true, validFrom: true },
    });
    if (!r)
      throw new NotFoundException(`Aucun taux ${pair.replace('_', '/')} n’est encore publié.`);
    return {
      id: r.id,
      pair,
      scaled: parseRate(r.rate.toFixed(8))!,
      source: r.source,
      validFrom: r.validFrom,
    };
  }

  async currentAll(): Promise<RateInfo[]> {
    const out: RateInfo[] = [];
    for (const pair of ['USD_CDF', 'USD_CNY'] as const) {
      const r = await this.system.exchangeRate.findFirst({
        where: { pair, validFrom: { lte: new Date() } },
        orderBy: { validFrom: 'desc' },
      });
      if (r) out.push(toInfo(r));
    }
    return out;
  }

  async history(): Promise<RateInfo[]> {
    const rows = await this.system.exchangeRate.findMany({
      orderBy: { validFrom: 'desc' },
      take: 100,
    });
    return rows.map(toInfo);
  }

  /** Publication d'un taux par l'administration (chemin système audité). */
  async publish(adminId: string, input: CreateRateInput): Promise<RateInfo> {
    const scaled = parseRate(input.rate);
    if (!scaled) throw new BadRequestException('Taux invalide.');
    return this.system.$transaction(async (tx) => {
      const row = await tx.exchangeRate.create({
        data: {
          pair: input.pair,
          rate: formatRate(scaled),
          source: input.source,
          createdBy: adminId,
        },
      });
      await this.audit.recordSystem(
        {
          actorUserId: adminId,
          actorRole: 'platform_admin',
          action: 'fx.rate_published',
          entityType: 'exchange_rate',
          entityId: row.id,
          after: { pair: input.pair, rate: formatRate(scaled), source: input.source },
        },
        tx,
      );
      return toInfo(row);
    });
  }
}
