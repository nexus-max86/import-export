const KEY = 'konzia.activeOrg';

/** Organisation active de l'espace professionnel (préférence locale de l'appareil). */
export function getActiveOrg(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setActiveOrg(id: string | null): void {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    // Stockage indisponible (navigation privée) : on redemandera l'organisation.
  }
}
