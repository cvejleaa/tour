// Tests for driftlog — statusfladen må ALDRIG lyve:
// værste niveau vinder, manuelle kørsler rører ikke skemaets puls, og en
// alarm genåbner, når hændelsen ses igen.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { statusSamler, meldAlarm, loesDriftAlarmer, vaerste } = require('./driftlog');

const FieldValue = { serverTimestamp: () => ({ __ts: true }) };

function fakeDb() {
  const docs = new Map();
  const key = (col, id) => `${col}/${id}`;
  const colObj = (col) => ({
    doc: (id) => ({
      __key: key(col, id),
      async get() {
        const d = docs.get(key(col, id));
        return { exists: d != null, data: () => d };
      },
      async set(data, opts) {
        if (opts?.merge !== true) throw new Error('set uden merge');
        docs.set(key(col, id), { ...(docs.get(key(col, id)) || {}), ...data });
      },
    }),
    where(felt, op, vaerdi) {
      const filtre = [[felt, vaerdi]];
      const self = {
        where(f2, o2, v2) { filtre.push([f2, v2]); return self; },
        async get() {
          const hits = [...docs.entries()]
            .filter(([k]) => k.startsWith(`${col}/`))
            .filter(([, d]) => filtre.every(([f, v]) => (d[f] ?? null) === v))
            .map(([k, d]) => ({ ref: colObj(col).doc(k.slice(col.length + 1)), data: () => d }));
          return { docs: hits };
        },
      };
      return self;
    },
  });
  return {
    _docs: docs,
    collection: colObj,
    batch() {
      const ops = [];
      return {
        set(ref, data, opts) {
          if (opts?.merge !== true) throw new Error('batch.set uden merge');
          ops.push({ ref, data });
        },
        async commit() { for (const o of ops) await o.ref.set(o.data, { merge: true }); },
      };
    },
  };
}

describe('statusSamler', () => {
  it('værste niveau vinder — en grøn tabel-synk må ikke overskrive en rød resultat-synk', async () => {
    const db = fakeDb();
    const st = statusSamler({ type: 'sweep', gameId: 'sl' });
    st.fejl('Resultat-synken fejlede: HTTP 500');
    st.ok('Tabellen: 12 hold, uændret.', { rows: 12 });
    await st.skriv(db, FieldValue, { nowMs: 1000, naesteForventetFoerMs: 5000 });
    const doc = db._docs.get('driftlog/sweep-sl');
    expect(doc.niveau).toBe('fejl');
    expect(doc.besked).toContain('Resultat-synken fejlede');
    expect(doc.besked).toContain('Tabellen');
    expect(doc.koertAt).toBe(1000);
    expect(doc.naesteForventetFoer).toBe(5000);
  });

  it('en MANUEL kørsel rører hverken koertAt eller naesteForventetFoer — et klik må ikke skjule et dødt skema', async () => {
    const db = fakeDb();
    const skema = statusSamler({ type: 'kickoff', gameId: 'pl' });
    skema.ok('0 rettet.');
    await skema.skriv(db, FieldValue, { nowMs: 1000, naesteForventetFoerMs: 9000 });
    const manuel = statusSamler({ type: 'kickoff', gameId: 'pl' });
    manuel.ok('Manuel tør-kørsel.');
    await manuel.skriv(db, FieldValue, { kilde: 'manuel', nowMs: 8000 });
    const doc = db._docs.get('driftlog/kickoff-pl');
    expect(doc.koertAt).toBe(1000); // skemaets puls står urørt
    expect(doc.naesteForventetFoer).toBe(9000);
    expect(doc.senesteKilde).toBe('manuel');
  });

  it('vaerste er en total orden', () => {
    expect(vaerste('ok', 'advarsel')).toBe('advarsel');
    expect(vaerste('fejl', 'advarsel')).toBe('fejl');
    expect(vaerste('ok', 'ok')).toBe('ok');
  });
});

describe('naesteKoerselFoerMs — kadencen, "forsinket"-dommen hviler på', () => {
  const { naesteKoerselFoerMs } = require('./driftlog');
  const SWEEP = [2, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
  const dk = (s) => Date.parse(s); // ISO med eksplicit offset

  it('almindelig eftermiddag: 13:30 DK → næste 14:25 + 45 min slæk = 15:10', () => {
    const ud = naesteKoerselFoerMs(dk('2026-08-14T13:30:00+02:00'), { timer: SWEEP });
    expect(Math.abs(ud - dk('2026-08-14T15:10:00+02:00'))).toBeLessThan(90 * 1000);
  });

  it('nathullet: 23:30 DK → næste er 02:25 NÆSTE dag (+45) — ikke en tærskel, der lyser rødt hele natten', () => {
    const ud = naesteKoerselFoerMs(dk('2026-08-14T23:30:00+02:00'), { timer: SWEEP });
    expect(Math.abs(ud - dk('2026-08-15T03:10:00+02:00'))).toBeLessThan(90 * 1000);
  });

  it('efterårs-tilbagefald (25/10-2026, 02 findes to gange): rammer den FØRSTE 02:25 — sommertidens', () => {
    // Fra 00:30 DK (sommertid, +02): første vægur-02:25 er 02:25 CEST = 00:25Z.
    const ud = naesteKoerselFoerMs(dk('2026-10-25T00:30:00+02:00'), { timer: SWEEP });
    expect(Math.abs(ud - (Date.parse('2026-10-25T00:25:00Z') + 45 * 60000))).toBeLessThan(90 * 1000);
  });

  it('forårs-spring (28/3-2027, 02 findes ikke): forventningen hopper til 13:25 — som cron også gør', () => {
    const ud = naesteKoerselFoerMs(dk('2027-03-28T00:30:00+01:00'), { timer: SWEEP });
    expect(Math.abs(ud - dk('2027-03-28T14:10:00+02:00'))).toBeLessThan(90 * 1000);
  });
});

describe('meldAlarm + loesDriftAlarmer', () => {
  it('samme hændelse bliver til ÉT dokument med antal — og genåbner efter løsning', async () => {
    const db = fakeDb();
    // daempMs: 0 her — dæmpningen har sin egen test nedenfor.
    const a = { type: 'strandet', gameId: 'pl', kampId: 'r1-101', besked: 'Kampen mangler facit.', daempMs: 0 };
    await meldAlarm(db, FieldValue, { ...a, nowMs: 1 });
    await meldAlarm(db, FieldValue, { ...a, nowMs: 2 });
    const id = 'pl_r1-101_strandet';
    expect(db._docs.get(`driftAlarmer/${id}`).antal).toBe(2);
    expect(db._docs.get(`driftAlarmer/${id}`).foersteSetAt).toBe(1);
    // Løses automatisk, når hændelsen ikke længere ses…
    await loesDriftAlarmer(db, FieldValue, { type: 'strandet', gameId: 'pl', aktuelleKampIds: [], nowMs: 3 });
    expect(db._docs.get(`driftAlarmer/${id}`).loestAt).toBe(3);
    // …og GENÅBNER, hvis den ses igen — en gammel kvittering må ikke dække en ny hændelse.
    await meldAlarm(db, FieldValue, { ...a, nowMs: 4 });
    expect(db._docs.get(`driftAlarmer/${id}`).loestAt).toBeNull();
    expect(db._docs.get(`driftAlarmer/${id}`).antal).toBe(3);
  });

  it('dæmper genskrivning af en NYLIGT set åben alarm — men aldrig en genåbning', async () => {
    const db = fakeDb();
    const a = { type: 'strandet', gameId: 'pl', kampId: 'r1-101', besked: 'x' };
    await meldAlarm(db, FieldValue, { ...a, nowMs: 0 });
    // Set igen efter 1 time (< 6t-dæmpningen): ingen skrivning, antal står.
    await meldAlarm(db, FieldValue, { ...a, nowMs: 3600 * 1000 });
    expect(db._docs.get('driftAlarmer/pl_r1-101_strandet').antal).toBe(1);
    // Løst — og set igen kort efter: genåbningen må ALDRIG dæmpes.
    await loesDriftAlarmer(db, FieldValue, { type: 'strandet', gameId: 'pl', aktuelleKampIds: [], nowMs: 2 * 3600 * 1000 });
    await meldAlarm(db, FieldValue, { ...a, nowMs: 3 * 3600 * 1000 });
    expect(db._docs.get('driftAlarmer/pl_r1-101_strandet').loestAt).toBeNull();
  });

  it('lukker IKKE en alarm, hvis hændelse stadig ses', async () => {
    const db = fakeDb();
    await meldAlarm(db, FieldValue, { type: 'strandet', gameId: 'pl', kampId: 'r1-101', besked: 'x', nowMs: 1 });
    const { lukket } = await loesDriftAlarmer(db, FieldValue, {
      type: 'strandet', gameId: 'pl', aktuelleKampIds: ['r1-101'], nowMs: 2,
    });
    expect(lukket).toBe(0);
    expect(db._docs.get('driftAlarmer/pl_r1-101_strandet').loestAt).toBeNull();
  });
});
