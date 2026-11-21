import { describe, expect, it } from 'vitest';
import { chargeableWeightG, PARCEL_CODE_PATTERN, parcelCode, volumetricWeightG } from './parcels';

describe('colis', () => {
  it('fabrique un code lisible sans caractères ambigus', () => {
    const code = parcelCode(new Uint8Array([0, 31, 32, 255, 7, 100]));
    expect(code).toMatch(PARCEL_CODE_PATTERN);
    expect(code).not.toMatch(/[01OI]/);
  });

  it('calcule le poids volumétrique (L × l × h / diviseur) en grammes', () => {
    // 30 × 20 × 30 cm ÷ 6000 = 3,0 kg (exemple de l'écran 09)
    expect(volumetricWeightG({ lengthMm: 300, widthMm: 200, heightMm: 300 }, 6000)).toBe(3000);
    expect(volumetricWeightG({ lengthMm: 300, widthMm: 200, heightMm: 300 }, 5000)).toBe(3600);
    expect(volumetricWeightG({ lengthMm: 300, widthMm: null, heightMm: 300 }, 5000)).toBeNull();
  });

  it('facture le plus élevé du poids réel et du poids volumétrique', () => {
    expect(chargeableWeightG(2500, 3000)).toBe(3000);
    expect(chargeableWeightG(4200, 3000)).toBe(4200);
    expect(chargeableWeightG(null, null)).toBeNull();
  });
});
