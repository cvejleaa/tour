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

describe('meldAlarm + loesDriftAlarmer', () => {
  it('samme hændelse bliver til ÉT dokument med antal — og genåbner efter løsning', async () => {
    const db = fakeDb();
    const a = { type: 'strandet', gameId: 'pl', kampId: 'r1-101', besked: 'Kampen mangler facit.' };
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
