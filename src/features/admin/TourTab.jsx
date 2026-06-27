// ---------------------------------------------------------------------------
// TourTab – admin: seed etaperute + kør resultat-sync nu.
// "Synk nu" henter det proxyen har lige nu — før Touren 2026 er kørt, er det
// 2025-data, så knappen fungerer også som test med rigtige 2025-resultater.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { doc, setDoc } from 'firebase/firestore';
import { functions, db } from '../../firebase';
import { COL } from '../../lib/constants';
import { placeholderRoute2026 } from '../../data/route2026';
import { useActiveSeason } from '../stages/useActiveSeason';
import { useTourSettings } from '../stages/useTourSettings';
import { useStages } from '../stages/useStages';
import { activeQuestionsForStage } from '../../lib/tourScoring';

// Kolonneoverskrifter for spørgsmåls-overblikket (samme rækkefølge som STAGE_FIELDS).
const QUESTION_COLS = [
  { key: 'winnerTeam', label: 'Vinder-hold' },
  { key: 'gcTeam', label: 'Bedste hold' },
  { key: 'mountainTeam', label: 'Bjergpoint' },
  { key: 'sprintTeam', label: 'Sprintpoint' },
];

const STAGE_TYPE_LABEL = {
  flat: 'Flad', hilly: 'Kuperet', mountain: 'Bjerg',
  itt: 'Enkeltstart', ttt: 'Holdtidskørsel', unknown: 'Etape',
};

const POINT_FIELDS = [
  { key: 'winnerTeam', label: 'Etapevinderens hold' },
  { key: 'gcTeam', label: 'Bedste hold / de første ryttere' },
  { key: 'mountainTeam', label: 'Flest bjergpoint' },
  { key: 'sprintTeam', label: 'Flest sprintpoint' },
  { key: 'untippedPenalty', label: 'Straf for utippet etape' },
];

function Result({ data }) {
  if (!data) return null;
  return (
    <pre style={{ fontSize: '0.78rem', background: 'var(--c-bg-alt, #f5f5f5)', padding: '0.5rem', borderRadius: 6, overflow: 'auto' }}>
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

// Overblik: aktive spørgsmål pr. etape. Hver række har 4 checkboxes, forudfyldt
// fra activeQuestionsForStage(stage) (override eller type-standard). "Gem"
// skriver { questions: {...} } på etape-dokumentet (setDoc merge).
function StageQuestionsOverview({ season }) {
  const { stages } = useStages(season);
  const [draft, setDraft] = useState({}); // stageId -> {winnerTeam,...}
  const [savingId, setSavingId] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  function questionsFor(stage) {
    return draft[stage.id] || activeQuestionsForStage(stage);
  }

  function toggle(stage, key) {
    setMsg(''); setErr('');
    const cur = questionsFor(stage);
    setDraft((prev) => ({ ...prev, [stage.id]: { ...cur, [key]: !cur[key] } }));
  }

  async function saveRow(stage) {
    setMsg(''); setErr('');
    setSavingId(stage.id);
    try {
      await setDoc(
        doc(db, COL.STAGES, stage.id),
        { questions: questionsFor(stage) },
        { merge: true },
      );
      setDraft((prev) => { const next = { ...prev }; delete next[stage.id]; return next; });
      setMsg(`Spørgsmål gemt for etape ${stage.number}.`);
    } catch (e) {
      console.error(e);
      setErr(e?.message || String(e));
    } finally {
      setSavingId('');
    }
  }

  if (!stages.length) {
    return <p style={{ fontSize: '0.85rem', color: 'var(--c-muted)' }}>Ingen etaper seedet endnu.</p>;
  }

  return (
    <div style={{ overflowX: 'auto' }} data-testid="questions-overview">
      <table style={{ borderCollapse: 'collapse', fontSize: '0.82rem', width: '100%' }}>
        <thead>
          <tr style={{ textAlign: 'left' }}>
            <th style={{ padding: '0.3rem 0.5rem' }}>#</th>
            <th style={{ padding: '0.3rem 0.5rem' }}>Type</th>
            <th style={{ padding: '0.3rem 0.5rem' }}>Rute</th>
            {QUESTION_COLS.map((c) => (
              <th key={c.key} style={{ padding: '0.3rem 0.5rem', textAlign: 'center' }}>{c.label}</th>
            ))}
            <th style={{ padding: '0.3rem 0.5rem' }} />
          </tr>
        </thead>
        <tbody>
          {stages.map((stage) => {
            const q = questionsFor(stage);
            const dirty = !!draft[stage.id];
            return (
              <tr key={stage.id} data-testid={`q-row-${stage.number}`} style={{ borderTop: '1px solid var(--c-border, #ddd)' }}>
                <td style={{ padding: '0.3rem 0.5rem', fontWeight: 700 }}>{stage.number}</td>
                <td style={{ padding: '0.3rem 0.5rem' }}>{STAGE_TYPE_LABEL[stage.type] || stage.type || '—'}</td>
                <td style={{ padding: '0.3rem 0.5rem', color: 'var(--c-muted)' }}>
                  {stage.startCity ? `${stage.startCity} → ${stage.finishCity ?? ''}` : '—'}
                </td>
                {QUESTION_COLS.map((c) => (
                  <td key={c.key} style={{ padding: '0.3rem 0.5rem', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={!!q[c.key]}
                      onChange={() => toggle(stage, c.key)}
                      data-testid={`q-${stage.number}-${c.key}`}
                    />
                  </td>
                ))}
                <td style={{ padding: '0.3rem 0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={!dirty || savingId === stage.id}
                    onClick={() => saveRow(stage)}
                    data-testid={`q-save-${stage.number}`}
                  >
                    {savingId === stage.id ? '…' : 'Gem'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {msg && <p style={{ color: 'var(--c-ok, green)', fontSize: '0.85rem' }}>{msg}</p>}
      {err && <p style={{ color: 'var(--c-err)', fontSize: '0.85rem' }}>{err}</p>}
    </div>
  );
}

export default function TourTab() {
  const season = useActiveSeason();
  const tourSettings = useTourSettings();
  const [busy, setBusy] = useState('');
  const [out, setOut] = useState(null);
  const [err, setErr] = useState('');
  const [seasonInput, setSeasonInput] = useState('');

  // Pointopsætning – forudfyldes med nuværende værdier fra config/settings
  // (flettet over standardværdier af useTourSettings).
  const [pointInputs, setPointInputs] = useState({});
  const [gcTopNInput, setGcTopNInput] = useState('');
  const [pointsTouched, setPointsTouched] = useState(false);
  const [pointsMsg, setPointsMsg] = useState('');
  const [pointsErr, setPointsErr] = useState('');

  // Synk inputs med config, indtil brugeren begynder at redigere.
  useEffect(() => {
    if (pointsTouched) return;
    setPointInputs(
      POINT_FIELDS.reduce((acc, f) => {
        acc[f.key] = String(tourSettings.points[f.key]);
        return acc;
      }, {}),
    );
    setGcTopNInput(String(tourSettings.gcTopN));
  }, [tourSettings, pointsTouched]);

  function editPoint(key, value) {
    setPointsTouched(true);
    setPointsMsg('');
    setPointsErr('');
    setPointInputs((prev) => ({ ...prev, [key]: value }));
  }

  async function savePoints() {
    setPointsMsg('');
    setPointsErr('');
    const points = {};
    for (const f of POINT_FIELDS) {
      const v = Number(pointInputs[f.key]);
      if (!Number.isFinite(v)) {
        setPointsErr(`Ugyldigt tal for "${f.label}"`);
        return;
      }
      points[f.key] = v;
    }
    const gcTopN = Number(gcTopNInput);
    if (!Number.isInteger(gcTopN) || gcTopN < 1) {
      setPointsErr('"Antal ryttere" skal være et helt tal ≥ 1');
      return;
    }
    setBusy('points');
    try {
      await setDoc(doc(db, COL.CONFIG, 'settings'), { points, gcTopN }, { merge: true });
      setPointsTouched(false);
      setPointsMsg('Pointopsætning gemt.');
    } catch (e) {
      console.error(e);
      setPointsErr(e?.message || String(e));
    } finally {
      setBusy('');
    }
  }

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
      startTime: s.startTime ?? null,
      // Valgfrie felter – kun med når ruten faktisk har dem.
      ...(s.elevation != null ? { elevation: s.elevation } : {}),
      ...(s.expertTip != null ? { expertTip: s.expertTip } : {}),
      questions: s.questions,
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

      <section style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ marginBottom: '0.25rem' }}>Pointopsætning</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--c-muted)', marginTop: 0 }}>
          Justér hvor mange point hvert ramt holdtip giver. Værdierne bruges af
          serveren ved beregning af etape-point.
        </p>
        <div style={{ display: 'grid', gap: '0.5rem', maxWidth: 380 }}>
          {POINT_FIELDS.map((f) => (
            <label key={f.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.88rem' }}>
              <span>{f.label}</span>
              <input
                type="number"
                value={pointInputs[f.key] ?? ''}
                onChange={(e) => editPoint(f.key, e.target.value)}
                style={{ width: 90, padding: '0.4rem', borderRadius: 6, border: '1px solid var(--c-border, #ccc)' }}
              />
            </label>
          ))}
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.88rem' }}>
            <span>Antal ryttere der tæller i &quot;bedste hold&quot;</span>
            <input
              type="number"
              min="1"
              step="1"
              value={gcTopNInput}
              onChange={(e) => { setPointsTouched(true); setPointsMsg(''); setPointsErr(''); setGcTopNInput(e.target.value); }}
              style={{ width: 90, padding: '0.4rem', borderRadius: 6, border: '1px solid var(--c-border, #ccc)' }}
            />
          </label>
        </div>
        <div style={{ marginTop: '0.6rem' }}>
          <button className="btn" disabled={busy === 'points'} onClick={savePoints}>
            {busy === 'points' ? 'Gemmer…' : 'Gem pointopsætning'}
          </button>
        </div>
        {pointsMsg && <p style={{ color: 'var(--c-ok, green)', fontSize: '0.85rem' }}>{pointsMsg}</p>}
        {pointsErr && <p style={{ color: 'var(--c-err)', fontSize: '0.85rem' }}>{pointsErr}</p>}
      </section>

      <section style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ marginBottom: '0.25rem' }}>Spørgsmål pr. etape</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--c-muted)', marginTop: 0 }}>
          Vælg hvilke af de fire holdspørgsmål der stilles på hver etape. Som
          standard følger de etapetypen (fx ingen bjergpoint på en flad etape,
          kun vinder-hold på en holdtidskørsel). Fravalgte spørgsmål vises ikke
          og kan hverken give point eller straf.
        </p>
        <StageQuestionsOverview season={season} />
      </section>

      {err && <p style={{ color: 'var(--c-err)' }}>{err}</p>}
      <Result data={out} />
    </div>
  );
}
