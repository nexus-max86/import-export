import type { MarketplaceCode } from './organizations';

/**
 * Domaines reconnus par marketplace (liste blanche). Un hôte correspond s'il est égal au
 * domaine ou s'il en est un sous-domaine. Toute modification est revue et testée.
 */
export const MARKETPLACE_DOMAINS: Record<MarketplaceCode, string[]> = {
  shein: ['shein.com', 'shein.co.uk', 'sheingsp.com', 'onelink.shein.com'],
  aliexpress: ['aliexpress.com', 'aliexpress.us', 'aliexpress.ru', 'a.aliexpress.com'],
  alibaba: ['alibaba.com'],
  '1688': ['1688.com'],
  amazon: [
    'amazon.com',
    'amazon.fr',
    'amazon.co.uk',
    'amazon.de',
    'amazon.ae',
    'amazon.ca',
    'amazon.cn',
    'a.co',
    'amzn.to',
    'amzn.eu',
  ],
  temu: ['temu.com'],
  taobao: ['taobao.com', 'tmall.com', 'tb.cn'],
  pinduoduo: ['pinduoduo.com', 'yangkeduo.com'],
  ebay: ['ebay.com', 'ebay.fr', 'ebay.co.uk', 'ebay.de', 'ebay.ca', 'ebay.us'],
};

/** Paramètres de pistage retirés à la normalisation (le lien reste valable). */
const TRACKING_PARAM =
  /^(utm_\w+|spm|scm|aff_\w+|_randl_\w+|srcsns|sourcetype|gclid|fbclid|ref|ref_|share_\w+|sharesource|_t|tt_\w+|mkevt|mkcid|mkrid|campid|toolid|customid|pf_rd_\w+|pd_rd_\w+|psc|smid|refer_page_\w+|algo_\w+|gatewayadapt|social_\w+)$/i;

export type UrlAnalysis =
  | { ok: true; url: string; marketplace: MarketplaceCode | null; host: string }
  | { ok: false; reason: string };

export function marketplaceForHost(host: string): MarketplaceCode | null {
  const h = host.toLowerCase().replace(/\.$/, '');
  for (const [code, domains] of Object.entries(MARKETPLACE_DOMAINS) as [
    MarketplaceCode,
    string[],
  ][]) {
    if (domains.some((d) => h === d || h.endsWith(`.${d}`))) return code;
  }
  return null;
}

/**
 * Analyse un lien collé par le client : HTTPS uniquement, pas d'identifiants ni d'adresse IP,
 * port standard, paramètres de pistage retirés. Un domaine inconnu n'est pas une erreur :
 * `marketplace` vaut alors null et le client saisit l'article à la main.
 */
export function analyzeProductUrl(input: string): UrlAnalysis {
  const raw = input.trim();
  if (raw.length === 0) return { ok: false, reason: 'Collez le lien du produit.' };
  if (raw.length > 2048) return { ok: false, reason: 'Lien trop long.' };
  // Lien copié depuis un message : on récupère la première URL du texte.
  const found = raw.match(/https?:\/\/\S+/i)?.[0] ?? raw;
  let url: URL;
  try {
    url = new URL(found);
  } catch {
    return { ok: false, reason: 'Ce n’est pas un lien valide. Il doit commencer par https://' };
  }
  const known = marketplaceForHost(url.hostname);
  if (url.protocol === 'http:' && known) url.protocol = 'https:';
  if (url.protocol !== 'https:')
    return { ok: false, reason: 'Seuls les liens https:// sont acceptés.' };
  if (url.username || url.password)
    return { ok: false, reason: 'Lien refusé (identifiants dans l’adresse).' };
  if (url.port && url.port !== '443')
    return { ok: false, reason: 'Lien refusé (port non standard).' };
  const host = url.hostname.toLowerCase();
  if (/^\d+(\.\d+){3}$/.test(host) || host.startsWith('[') || host.includes(':')) {
    return { ok: false, reason: 'Lien refusé (adresse IP au lieu d’un site).' };
  }
  if (
    !host.includes('.') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'localhost'
  ) {
    return { ok: false, reason: 'Lien refusé (site non public).' };
  }
  for (const key of [...url.searchParams.keys()])
    if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
  url.hash = '';
  url.port = '';
  return { ok: true, url: url.toString(), marketplace: known, host };
}
