/**
 * Normalise un numéro congolais au format international (+243XXXXXXXXX).
 * Accepte « 081 000 0000 », « 0810000000 », « 243810000000 », « +243 81 000 0000 ».
 * Renvoie null si le numéro n'est pas un mobile congolais plausible.
 * Les numéros étrangers déjà au format « +XXX… » sont conservés tels quels.
 */
export function normalizePhone(input: string): string | null {
  const compact = input.replace(/[\s.\-()]/g, '');
  if (/^\+(?!243)[1-9]\d{7,14}$/.test(compact)) return compact;
  const digits = compact.replace(/^\+/, '');
  let national: string;
  if (/^243\d{9}$/.test(digits)) national = digits.slice(3);
  else if (/^0\d{9}$/.test(digits)) national = digits.slice(1);
  else if (/^\d{9}$/.test(digits)) national = digits;
  else return null;
  // Mobiles RDC : préfixes 8x et 9x.
  if (!/^[89]\d{8}$/.test(national)) return null;
  return `+243${national}`;
}

/** Lien « Écrire sur WhatsApp » (wa.me), message prérempli facultatif. */
export function whatsappLink(phone: string, message?: string): string {
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}

/** Affichage lisible : +243810000000 → « +243 81 000 0000 ». */
export function formatPhone(phone: string): string {
  const m = phone.match(/^\+243(\d{2})(\d{3})(\d{4})$/);
  return m ? `+243 ${m[1]} ${m[2]} ${m[3]}` : phone;
}
