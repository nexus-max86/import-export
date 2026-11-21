import { FileCrypto } from './file-crypto';

describe('FileCrypto', () => {
  const crypto = new FileCrypto(Buffer.alloc(32, 7).toString('base64'));

  it('chiffre puis déchiffre à l’identique, sans contenu en clair dans le blob', () => {
    const plain = Buffer.from('RCCM CD/LSH/RCCM/24-A-01234');
    const blob = crypto.encrypt(plain);
    expect(blob.includes(plain)).toBe(false);
    expect(crypto.decrypt(blob)).toEqual(plain);
  });

  it('détecte une altération', () => {
    const blob = crypto.encrypt(Buffer.from('document'));
    blob[blob.length - 1] = (blob[blob.length - 1] ?? 0) ^ 0xff;
    expect(() => crypto.decrypt(blob)).toThrow();
  });

  it('refuse une autre clé', () => {
    const other = new FileCrypto(Buffer.alloc(32, 8).toString('base64'));
    expect(() => other.decrypt(crypto.encrypt(Buffer.from('x')))).toThrow();
  });
});
