/**
 * Vue générale de l'espace Business (maquette 4). Chaque chiffre est calculé côté serveur à partir
 * des données de l'organisation ; aucune estimation ni prévision.
 */
export interface MoneyByCurrency {
  currency: string;
  amount: number;
}

/** Alerte à règle (D10) : constat, données qui la justifient, lien pour vérifier. Jamais de l'« IA ». */
export interface OverviewAlert {
  kind: 'late_order' | 'idle_parcel' | 'purchase_not_received';
  title: string;
  detail: string;
  href: string;
}

export interface OrgOverview {
  requestsToHandle: number;
  oldestRequestHours: number | null;
  quotesAwaitingCustomer: number;
  activeOrders: number;
  inTransitOrders: number;
  lateOrders: number;
  itemsToReceive: number;
  parcelsToShip: number;
  shipmentsInProgress: number;
  /** Présents seulement si le rôle peut voir les paiements (`payment.view`). */
  finance: {
    paymentsToVerify: number;
    owed: MoneyByCurrency[];
    confirmedLast7Days: MoneyByCurrency[];
  } | null;
  /** Commandes créées par semaine (8 semaines, la plus ancienne d'abord). */
  ordersPerWeek: { weekStart: string; count: number }[];
  alerts: OverviewAlert[];
}
