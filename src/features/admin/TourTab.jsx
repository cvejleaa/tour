// ---------------------------------------------------------------------------
// TourTab – admin: seed etaperute + kør resultat-sync nu.
// "Synk nu" henter det proxyen har lige nu — før Touren 2026 er kørt, er det
// 2025-data, så knappen fungerer også som test med rigtige 2025-resultater.
// ---------------------------------------------------------------------------
import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { doc, setDoc } from 'firebase/firestore';
import { functions, db } from '../../firebase';
import { COL } from '../../lib/constants';
import { placeholderRoute2026 } from '../../data/route2026';
import { useActiveSeason } from '../stages/useActiveSeason';

function Result({ data }) {
  if (!data) return null;
  return (
    <pre style={{ fontSize: '0.78rem', background: 'var(--c-bg-alt, #f5f5f5)', padding: '0.5rem', borderRadius: 6, overflow: 'auto' }}>
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

export default function TourTab() {
  const season = useActiveSeason();
  const [busy, setBusy] = useState('');
  const [out, setOut] = useState(null);
  const [err, setErr] = useState('');
  const [seasonInput, setSeasonInput] = useState('');

  async function run(name, fn) {
    setBusy(name); setErr(''); setOut(null);
    try {
      setOut(await fn());
    } catch (e) {
      console.error(e);
      setErr(e?.message || String(e));
    } finally {
      setBusy('');
    }
  }

  const seedRoute = () => run('seed', async () => {
    const stages = placeholderRoute2026(season).map((s) => ({
      number: s.number, date: s.date, kickoff: s.kickoff, type: s.type,
      typeCode: s.typeCode, km: s.km, startCity: s.startCity,
      finishCity: s.finishCity, image: s.image, description: s.description,
    }));
    const res = await httpsCallable(functions, 'seedTourRoute')({ season, stages });
    return res.data;
  });

  const setSeason = () => run('season', async () => {
    const y = Number(seasonInput);
    if (!Number.isFinite(y) || y < 2000) throw new Error('Ugyldigt årstal');
    await setDoc(doc(db, COL.CONFIG, 'settings'), { activeSeason: y }, { merge: true });
    return { activeSeason: y };
  });

  const syncNow = (dryRun) => run('sync', async () => {
    const res = await httpsCallable(functions, 'syncTourNow')({ dryRun });
    return res.data;
  });

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>🚴 Tour de France</h2>

      <section style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ marginBottom: '0.25rem' }}>Aktiv sæson: {season}</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--c-muted)', marginTop: 0 }}>
          Al data (etaper, tip, hold, stilling) gemmes pr. årstal. Skift sæson
          næste år, så ligger {season} urørt som historik.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            type="number" placeholder={`fx ${season + 1}`} value={seasonInput}
            onChange={(e) => setSeasonInput(e.target.value)}
            style={{ width: 110, padding: '0.4rem', borderRadius: 6, border: '1px solid var(--c-border, #ccc)' }}
          />
          <button className="btn btn--ghost" disabled={busy || !seasonInput} onClick={setSeason}>
            {busy === 'season' ? '…' : 'Skift aktiv sæson'}
          </button>
        </div>
      </section>

      <section style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ marginBottom: '0.25rem' }}>1. Seed etaperuten</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--c-muted)', marginTop: 0 }}>
          Opretter de 21 etape-dokumenter (med foreløbige 2026-datoer/lås), så
          spillerne kan tippe. Datoer kan rettes senere.
        </p>
        <button className="btn" disabled={busy} onClick={seedRoute}>
          {busy === 'seed' ? 'Seeder…' : 'Seed 2026-rute (21 etaper)'}
        </button>
      </section>

      <section style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ marginBottom: '0.25rem' }}>2. Hent resultater</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--c-muted)', marginTop: 0 }}>
          Henter etaperesultater fra letour-proxyen, beregner point og udfylder
          holdene. <strong>Indtil Tour 2026 er kørt, henter den 2025-data</strong> —
          så denne knap er også din test med rigtige resultater.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn--ghost" disabled={busy} onClick={() => syncNow(true)}>
            {busy === 'sync' ? '…' : '🔍 Tør-kør (vis kun)'}
          </button>
          <button className="btn" disabled={busy} onClick={() => syncNow(false)}>
            {busy === 'sync' ? 'Synker…' : '⬇️ Synk resultater nu'}
          </button>
        </div>
      </section>

      {err && <p style={{ color: 'var(--c-err)' }}>{err}</p>}
      <Result data={out} />
    </div>
  );
}
