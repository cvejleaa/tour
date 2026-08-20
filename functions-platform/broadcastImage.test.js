// broadcastImage — vagten for billed-upload. Den er den ENESTE kontrol af,
// hvad der lander i Storage (callablen gør intet andet end at kalde den), så
// hver gren muteres: type-allowlist, størrelses-loft, sti-sanitering.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { validerBroadcastBillede, broadcastBilledeSti, MAKS_BYTES } = require('./broadcastImage');

describe('validerBroadcastBillede — type-allowlist', () => {
  it('tillader PNG/JPG/GIF/WEBP med korrekt filendelse', () => {
    expect(validerBroadcastBillede({ contentType: 'image/png', bytes: 100 })).toEqual({ ok: true, ext: 'png' });
    expect(validerBroadcastBillede({ contentType: 'image/jpeg', bytes: 100 })).toEqual({ ok: true, ext: 'jpg' });
    expect(validerBroadcastBillede({ contentType: 'image/gif', bytes: 100 })).toEqual({ ok: true, ext: 'gif' });
    expect(validerBroadcastBillede({ contentType: 'image/webp', bytes: 100 })).toEqual({ ok: true, ext: 'webp' });
  });

  it('er ligeglad med store/små bogstaver i content-type', () => {
    expect(validerBroadcastBillede({ contentType: 'IMAGE/PNG', bytes: 100 }).ok).toBe(true);
  });

  // SVG er BEVIDST afvist: en scriptbar dokumenttype (kan bære onload/script)
  // er en XSS-vej, hvis en modtager åbner billed-URL'en direkte.
  it('afviser SVG, PDF og ukendt type', () => {
    expect(validerBroadcastBillede({ contentType: 'image/svg+xml', bytes: 100 }).ok).toBe(false);
    expect(validerBroadcastBillede({ contentType: 'application/pdf', bytes: 100 }).ok).toBe(false);
    expect(validerBroadcastBillede({ contentType: '', bytes: 100 }).ok).toBe(false);
    expect(validerBroadcastBillede({}).ok).toBe(false);
  });
});

describe('validerBroadcastBillede — størrelses-loft', () => {
  it('afviser et billede OVER loftet, tillader PRÆCIS på loftet', () => {
    // Bånd: loftet er MAKS_BYTES. Ét byte over → rødt; præcis på → grønt.
    expect(validerBroadcastBillede({ contentType: 'image/png', bytes: MAKS_BYTES + 1 }).ok).toBe(false);
    expect(validerBroadcastBillede({ contentType: 'image/png', bytes: MAKS_BYTES }).ok).toBe(true);
  });

  it('afviser et tomt billede (0 bytes eller ugyldigt tal)', () => {
    expect(validerBroadcastBillede({ contentType: 'image/png', bytes: 0 }).ok).toBe(false);
    expect(validerBroadcastBillede({ contentType: 'image/png', bytes: NaN }).ok).toBe(false);
    expect(validerBroadcastBillede({ contentType: 'image/png', bytes: -5 }).ok).toBe(false);
  });
});

describe('broadcastBilledeSti — unik, saniteret sti', () => {
  it('bygger broadcast/{unik}.{ext}', () => {
    expect(broadcastBilledeSti('png', 'abc123')).toBe('broadcast/abc123.png');
  });

  // Sti-traversal: en ondsindet `unik` må ALDRIG kunne skrive uden for
  // broadcast/. Alt uden for [A-Za-z0-9_-] strippes.
  it('strippper sti-traversal og skråstreger fra unik', () => {
    expect(broadcastBilledeSti('png', '../../secret')).toBe('broadcast/secret.png');
    expect(broadcastBilledeSti('png', 'a/b/c')).toBe('broadcast/abc.png');
    expect(broadcastBilledeSti('png', 'x.y')).toBe('broadcast/xy.png');
  });

  it('returnerer null for tom/kun-ugyldig unik (fejl-lukket) og for ukendt ext', () => {
    expect(broadcastBilledeSti('png', '')).toBeNull();
    expect(broadcastBilledeSti('png', '///')).toBeNull();
    expect(broadcastBilledeSti('exe', 'abc')).toBeNull();
    expect(broadcastBilledeSti('svg', 'abc')).toBeNull();
  });
});
