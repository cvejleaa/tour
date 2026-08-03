import { describe, it, expect } from 'vitest';
import { planMigration, parseHashConfig } from './migrate-vm-users.mjs';

describe('planMigration (VM → platform, flet på e-mail)', () => {
  const platform = new Map([
    ['anna@example.com', 'p-anna'],
    ['bo@example.com', 'p-bo'],
  ]);

  it('fletter VM-brugere hvis e-mailen allerede findes', () => {
    const { merge } = planMigration([{ uid: 'vm-anna', email: 'Anna@Example.com' }], platform);
    expect(merge).toHaveLength(1);
    expect(merge[0]).toMatchObject({ uid: 'vm-anna', email: 'anna@example.com', platformUid: 'p-anna' });
  });

  it('opretter VM-brugere hvis e-mailen er ny', () => {
    const { create } = planMigration([{ uid: 'vm-cara', email: 'cara@example.com' }], platform);
    expect(create).toHaveLength(1);
    expect(create[0].platformUid).toBeUndefined();
  });

  it('springer brugere uden e-mail over', () => {
    const { skipped, merge, create } = planMigration([{ uid: 'vm-x' }], platform);
    expect(skipped).toHaveLength(1);
    expect(merge).toHaveLength(0);
    expect(create).toHaveLength(0);
  });

  it('matcher e-mail uafhængigt af store/små bogstaver og mellemrum', () => {
    const { merge } = planMigration([{ uid: 'vm-bo', email: '  BO@example.com ' }], platform);
    expect(merge[0].platformUid).toBe('p-bo');
  });

  it('tolererer tomt input', () => {
    expect(planMigration(undefined, platform)).toEqual({ merge: [], create: [], skipped: [] });
  });
});

describe('parseHashConfig', () => {
  it('udtrækker scrypt-parametre fra hash-blokken', () => {
    const raw = `
      hash_config {
        algorithm: SCRYPT,
        base64_signer_key: c2lnbmVy,
        base64_salt_separator: Qw==,
        rounds: 8,
        mem_cost: 14,
      }`;
    const opt = parseHashConfig(raw);
    expect(opt.algorithm).toBe('SCRYPT');
    expect(opt.rounds).toBe(8);
    expect(opt.memoryCost).toBe(14);
    expect(Buffer.isBuffer(opt.key)).toBe(true);
    expect(Buffer.isBuffer(opt.saltSeparator)).toBe(true);
  });

  it('returnerer null hvis blokken mangler/ufuldstændig', () => {
    expect(parseHashConfig('')).toBeNull();
    expect(parseHashConfig('rounds: 8')).toBeNull();
  });
});
