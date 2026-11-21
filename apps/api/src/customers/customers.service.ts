import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@konzia/db';
import {
  whatsappLink,
  type ClaimLink,
  type ClaimResult,
  type OrgCustomerInfo,
  type OrgCustomerInput,
} from '@konzia/shared';
import { AuditService } from '../audit/audit.service';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { randomToken, sha256 } from '../common/crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { OrgContext } from '../tenancy/org-context';
import { TenantDb, type TenantTx } from '../tenancy/tenant-db.service';

const PAGE_SIZE = 50;
const CLAIM_TTL_MS = 14 * 86_400_000;

const SELECT = {
  id: true,
  fullName: true,
  phoneWhatsapp: true,
  email: true,
  cityId: true,
  serviceZoneId: true,
  addressLine: true,
  landmark: true,
  notesPrivate: true,
  source: true,
  userId: true,
  createdAt: true,
  city: { select: { name: true } },
  serviceZone: { select: { name: true } },
} as const;

type Row = Prisma.OrgCustomerGetPayload<{ select: typeof SELECT }>;

function toInfo(r: Row): OrgCustomerInfo {
  return {
    id: r.id,
    fullName: r.fullName,
    phoneWhatsapp: r.phoneWhatsapp,
    email: r.email,
    cityId: r.cityId,
    cityName: r.city?.name ?? null,
    serviceZoneId: r.serviceZoneId,
    zoneName: r.serviceZone?.name ?? null,
    addressLine: r.addressLine,
    landmark: r.landmark,
    notesPrivate: r.notesPrivate,
    source: r.source,
    hasAccount: r.userId !== null,
    createdAt: r.createdAt.toISOString(),
  };
}

/**
 * Tables qui référencent une fiche client : lors d'une fusion, leurs lignes doivent être
 * réaffectées à la fiche conservée. RÈGLE : toute nouvelle table avec `org_customer_id`
 * doit être ajoutée ici (voir `merge`).
 */
const ORG_CUSTOMER_REFERENCES: { table: string; column: string }[] = [
  { table: 'quote_request_recipients', column: 'org_customer_id' },
  { table: 'quotes', column: 'org_customer_id' },
  { table: 'orders', column: 'org_customer_id' },
  { table: 'payments', column: 'org_customer_id' },
  { table: 'parcel_items', column: 'org_customer_id' },
];

@Injectable()
export class CustomersService {
  constructor(
    private readonly system: PrismaService,
    private readonly db: TenantDb,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  list(userId: string, org: OrgContext, q?: string, cursor?: string) {
    const search = q?.trim();
    return this.db.run(userId, async (tx) => {
      const rows = await tx.orgCustomer.findMany({
        where: {
          organizationId: org.organizationId,
          status: 'active',
          ...(search
            ? {
                OR: [
                  { fullName: { contains: search, mode: 'insensitive' } },
                  { phoneWhatsapp: { contains: search.replace(/\s/g, '') } },
                  { email: { contains: search, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        orderBy: { id: 'desc' },
        take: PAGE_SIZE + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: SELECT,
      });
      const items = rows.slice(0, PAGE_SIZE).map(toInfo);
      return { items, next: rows.length > PAGE_SIZE ? (items.at(-1)?.id ?? null) : null };
    });
  }

  get(userId: string, org: OrgContext, id: string): Promise<OrgCustomerInfo> {
    return this.db.run(userId, async (tx) => toInfo(await this.find(tx, org, id)));
  }

  create(userId: string, org: OrgContext, input: OrgCustomerInput): Promise<OrgCustomerInfo> {
    return this.db.run(userId, async (tx) => {
      await this.assertPlace(tx, input.cityId ?? null, input.serviceZoneId ?? null);
      if (input.phoneWhatsapp) {
        const twin = await tx.orgCustomer.findFirst({
          where: {
            organizationId: org.organizationId,
            status: 'active',
            phoneWhatsapp: input.phoneWhatsapp,
          },
          select: { fullName: true },
        });
        if (twin)
          throw new ConflictException(
            `Ce numéro est déjà utilisé par la fiche « ${twin.fullName} ».`,
          );
      }
      const row = await tx.orgCustomer.create({
        data: {
          organizationId: org.organizationId,
          source: 'manual',
          createdBy: userId,
          ...this.fields(input),
        },
        select: SELECT,
      });
      await this.audit.record(tx, {
        actorUserId: userId,
        actorRole: org.role,
        organizationId: org.organizationId,
        action: 'customer.created',
        entityType: 'org_customer',
        entityId: row.id,
        after: { fullName: row.fullName, source: 'manual' },
      });
      return toInfo(row);
    });
  }

  update(
    userId: string,
    org: OrgContext,
    id: string,
    input: OrgCustomerInput,
  ): Promise<OrgCustomerInfo> {
    return this.db.run(userId, async (tx) => {
      const before = await this.find(tx, org, id);
      await this.assertPlace(tx, input.cityId ?? null, input.serviceZoneId ?? null);
      const row = await tx.orgCustomer.update({
        where: { id },
        data: this.fields(input),
        select: SELECT,
      });
      await this.audit.record(tx, {
        actorUserId: userId,
        actorRole: org.role,
        organizationId: org.organizationId,
        action: 'customer.updated',
        entityType: 'org_customer',
        entityId: id,
        before: {
          fullName: before.fullName,
          phoneWhatsapp: before.phoneWhatsapp,
          email: before.email,
        },
        after: { fullName: row.fullName, phoneWhatsapp: row.phoneWhatsapp, email: row.email },
      });
      return toInfo(row);
    });
  }

  /** Lien à envoyer au client (souvent par WhatsApp) pour qu'il réclame sa fiche avec un compte. */
  createClaimLink(userId: string, org: OrgContext, id: string): Promise<ClaimLink> {
    return this.db.run(userId, async (tx) => {
      const customer = await this.find(tx, org, id);
      if (customer.userId) throw new ConflictException('Ce client a déjà un compte Konzia.');
      const token = randomToken();
      const expiresAt = new Date(Date.now() + CLAIM_TTL_MS);
      await tx.orgCustomer.update({
        where: { id },
        data: { claimTokenHash: sha256(token), claimTokenExpiresAt: expiresAt },
        select: { id: true },
      });
      const orgName = (
        await tx.organization.findUniqueOrThrow({
          where: { id: org.organizationId },
          select: { name: true },
        })
      ).name;
      await this.audit.record(tx, {
        actorUserId: userId,
        actorRole: org.role,
        organizationId: org.organizationId,
        action: 'customer.claim_link_created',
        entityType: 'org_customer',
        entityId: id,
      });
      const link = `${this.env.APP_URL}/reclamer?jeton=${token}`;
      return {
        link,
        expiresAt: expiresAt.toISOString(),
        whatsapp: customer.phoneWhatsapp
          ? whatsappLink(
              customer.phoneWhatsapp,
              `Bonjour ${customer.fullName}, ${orgName} vous invite à suivre vos commandes sur Konzia : ${link}`,
            )
          : null,
      };
    });
  }

  /**
   * Le client connecté réclame sa fiche. S'il avait déjà une fiche chez ce commissionnaire
   * (créée à son inscription), elle est fusionnée dans la fiche réclamée, qui porte l'historique.
   * Chemin système : le client n'est pas membre de l'organisation, la RLS ne lui montre pas la fiche.
   */
  async claim(userId: string, token: string): Promise<ClaimResult> {
    return this.system.$transaction(async (tx) => {
      const target = await tx.orgCustomer.findUnique({
        where: { claimTokenHash: sha256(token) },
        include: { organization: { select: { name: true } } },
      });
      if (
        !target ||
        target.status !== 'active' ||
        target.userId ||
        !target.claimTokenExpiresAt ||
        target.claimTokenExpiresAt <= new Date()
      ) {
        throw new BadRequestException(
          'Ce lien n’est plus valable. Demandez-en un nouveau à votre commissionnaire.',
        );
      }
      const existing = await tx.orgCustomer.findFirst({
        where: { organizationId: target.organizationId, userId, status: 'active' },
        select: { id: true },
      });
      if (existing) await this.merge(tx, existing.id, target.id);

      await tx.orgCustomer.update({
        where: { id: target.id },
        data: { userId, claimedAt: new Date(), claimTokenHash: null, claimTokenExpiresAt: null },
      });
      await this.audit.recordSystem(
        {
          actorUserId: userId,
          actorRole: 'self',
          organizationId: target.organizationId,
          action: 'customer.claimed',
          entityType: 'org_customer',
          entityId: target.id,
          after: { mergedFrom: existing?.id ?? null },
        },
        tx,
      );
      return { organizationName: target.organization.name, merged: existing !== null };
    });
  }

  /**
   * Fiche du client connecté chez un commissionnaire, créée si besoin (source « signup »).
   * Chemin système : appelé lors de l'envoi d'une demande, dans la transaction d'envoi.
   */
  async ensureForUser(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
  ): Promise<string> {
    const existing = await tx.orgCustomer.findFirst({
      where: { organizationId, userId, status: 'active' },
      select: { id: true },
    });
    if (existing) return existing.id;
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { displayName: true, email: true, phoneWhatsapp: true },
    });
    const created = await tx.orgCustomer.create({
      data: {
        organizationId,
        userId,
        fullName: user.displayName,
        email: user.email,
        phoneWhatsapp: user.phoneWhatsapp,
        source: 'signup',
      },
      select: { id: true },
    });
    return created.id;
  }

  /** Fusionne la fiche `fromId` dans `intoId` : références réaffectées, fiche source marquée « fusionnée ». */
  private async merge(tx: Prisma.TransactionClient, fromId: string, intoId: string): Promise<void> {
    for (const ref of ORG_CUSTOMER_REFERENCES) {
      await tx.$executeRawUnsafe(
        `UPDATE ${ref.table} SET ${ref.column} = $1::uuid WHERE ${ref.column} = $2::uuid`,
        intoId,
        fromId,
      );
    }
    await tx.orgCustomer.update({
      where: { id: fromId },
      data: { status: 'merged', mergedIntoId: intoId, userId: null },
    });
  }

  private fields(input: OrgCustomerInput) {
    return {
      fullName: input.fullName,
      phoneWhatsapp: input.phoneWhatsapp ?? null,
      email: input.email ?? null,
      cityId: input.cityId ?? null,
      serviceZoneId: input.serviceZoneId ?? null,
      addressLine: input.addressLine ?? null,
      landmark: input.landmark ?? null,
      notesPrivate: input.notesPrivate ?? null,
    };
  }

  private async find(tx: TenantTx, org: OrgContext, id: string): Promise<Row> {
    const row = await tx.orgCustomer.findFirst({
      where: { id, organizationId: org.organizationId, status: 'active' },
      select: SELECT,
    });
    if (!row) throw new NotFoundException('Client introuvable.');
    return row;
  }

  private async assertPlace(
    tx: TenantTx,
    cityId: string | null,
    zoneId: string | null,
  ): Promise<void> {
    if (zoneId && !cityId) throw new BadRequestException('Choisissez la ville de cette commune.');
    if (!zoneId || !cityId) return;
    const zone = await tx.serviceZone.findFirst({
      where: { id: zoneId, cityId },
      select: { id: true },
    });
    if (!zone)
      throw new BadRequestException('Cette commune ne fait pas partie de la ville choisie.');
  }
}
