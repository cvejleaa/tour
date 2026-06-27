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
import { callGenerateStageTip, saveStageTip, callSyncStageInfo } from './adminActions';

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
                  {stage.pointsAwarded && (
                    <span
                      data-testid={`q-hint-${stage.number}`}
                      title="Hentet fra letour: hvilke point-klassementer der uddeles på etapen"
                      style={{ display: 'block', fontSize: '0.72rem', color: 'var(--c-muted)' }}
                    >
                      letour: sprintpoint {stage.pointsAwarded.sprint ? '✓' : '✗'} / bjergpoint {stage.pointsAwarded.mountain ? '✓' : '✗'}
                      {stage.elevation != null ? ` · D+ ${stage.elevation} m` : ''}
                    </span>
                  )}
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

// Ekspert-tips pr. etape: hver etape har en redigerbar textarea (forudfyldt fra
// stage.expertTip), en "Generér" (AI for netop den etape) og en "Gem" (manuel
// override). "Generér manglende" kører AI for alle etaper uden tip. Listen er
// onSnapshot-drevet (useStages), så genererede tips dukker op af sig selv.
function StageExpertTips({ season }) {
  const { stages } = useStages(season);
  const [drafts, setDrafts] = useState({}); // stageId -> tekst (kun redigerede)
  const [busyId, setBusyId] = useState(''); // 'gen:<id>' | 'save:<id>' | 'gen-all'
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  function valueFor(stage) {
    return drafts[stage.id] != null ? drafts[stage.id] : (stage.expertTip || '');
  }

  function editTip(stageId, text) {
    setMsg(''); setErr('');
    setDrafts((prev) => ({ ...prev, [stageId]: text }));
  }

  async function generateOne(stage) {
    setMsg(''); setErr('');
    setBusyId(`gen:${stage.id}`);
    try {
      const res = await callGenerateStageTip({ stageId: stage.id });
      if (!res.ok) { setErr(res.error); return; }
      // Ryd lokalt udkast, så onSnapshot-værdien (den nye tekst) vises.
      setDrafts((prev) => { const next = { ...prev }; delete next[stage.id]; return next; });
      setMsg(`Ekspert-tip genereret for etape ${stage.number}.`);
    } catch (e) {
      console.error(e);
      setErr(e?.message || String(e));
    } finally {
      setBusyId('');
    }
  }

  async function saveOne(stage) {
    setMsg(''); setErr('');
    setBusyId(`save:${stage.id}`);
    try {
      await saveStageTip(stage.id, valueFor(stage));
      setDrafts((prev) => { const next = { ...prev }; delete next[stage.id]; return next; });
      setMsg(`Ekspert-tip gemt for etape ${stage.number}.`);
    } catch (e) {
      console.error(e);
      setErr(e?.message || String(e));
    } finally {
      setBusyId('');
    }
  }

  // Loop over etaperne og generér ét enkelt-tip ad gangen. Vi laver IKKE alle
  // 21 Claude-kald i ét server-kald (det rammer funktionens timeout → 504), men
  // ét callable-kald pr. etape med fremgangsvisning.
  async function regenerateList(targets, label) {
    setMsg(''); setErr('');
    setBusyId('gen-all');
    const sorted = [...targets].sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
    let done = 0; let failed = 0;
    for (const stage of sorted) {
      setMsg(`${label} ${done + failed + 1}/${sorted.length} (etape ${stage.number})…`);
      try {
        const res = await callGenerateStageTip({ stageId: stage.id });
        if (res.ok) {
          done++;
          // Ryd lokalt udkast, så onSnapshot-værdien (den nye tekst) vises.
          setDrafts((prev) => { const next = { ...prev }; delete next[stage.id]; return next; });
        } else {
          failed++;
        }
      } catch (e) {
        console.error(e);
        failed++;
      }
    }
    setBusyId('');
    setMsg(`Færdig: ${done} af ${sorted.length} ekspert-tip${failed ? ` (${failed} fejlede)` : ''}.`);
  }

  async function generateMissing() {
    const targets = stages.filter((s) => !(typeof s.expertTip === 'string' && s.expertTip.trim()));
    if (!targets.length) { setMsg('Alle etaper har allerede et tip.'); return; }
    await regenerateList(targets, 'Genererer');
  }

  async function regenerateAll() {
    if (!window.confirm('Regenerér ALLE ekspert-tips? Det overskriver de nuværende tips for alle etaper.')) return;
    await regenerateList(stages, 'Regenererer');
  }

  if (!stages.length) {
    return <p style={{ fontSize: '0.85rem', color: 'var(--c-muted)' }}>Ingen etaper seedet endnu.</p>;
  }

  return (
    <div data-testid="expert-tips">
      <div style={{ marginBottom: '0.75rem' }}>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={!!busyId}
          onClick={generateMissing}
          data-testid="tip-gen-missing"
        >
          {busyId === 'gen-all' ? 'Genererer…' : '✨ Generér manglende'}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={!!busyId}
          onClick={regenerateAll}
          data-testid="tip-regen-all"
          style={{ marginLeft: '0.5rem' }}
        >
          {busyId === 'regen-all' ? 'Regenererer…' : '🔄 Regenerér alle'}
        </button>
      </div>
      <div style={{ display: 'grid', gap: '0.9rem' }}>
        {stages.map((stage) => {
          const genBusy = busyId === `gen:${stage.id}`;
          const saveBusy = busyId === `save:${stage.id}`;
          return (
            <div
              key={stage.id}
              data-testid={`tip-row-${stage.number}`}
              style={{ borderTop: '1px solid var(--c-border, #ddd)', paddingTop: '0.6rem' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
                <strong style={{ fontSize: '0.9rem' }}>
                  Etape {stage.number} · {STAGE_TYPE_LABEL[stage.type] || stage.type || 'Etape'}
                </strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--c-muted)' }}>
                  {stage.startCity ? `${stage.startCity} → ${stage.finishCity ?? ''}` : ''}
                </span>
              </div>
              <textarea
                value={valueFor(stage)}
                onChange={(e) => editTip(stage.id, e.target.value)}
                rows={3}
                placeholder="Intet ekspert-tip endnu."
                data-testid={`tip-text-${stage.number}`}
                style={{ width: '100%', marginTop: '0.4rem', padding: '0.45rem', borderRadius: 6, border: '1px solid var(--c-border, #ccc)', fontSize: '0.85rem', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem' }}>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={!!busyId}
                  onClick={() => generateOne(stage)}
                  data-testid={`tip-gen-${stage.number}`}
                >
                  {genBusy ? '…' : '✨ Generér'}
                </button>
                <button
                  type="button"
                  className="btn btn--sm"
                  disabled={!!busyId}
                  onClick={() => saveOne(stage)}
                  data-testid={`tip-save-${stage.number}`}
                >
                  {saveBusy ? '…' : 'Gem'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
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
      ...(s.profileImage ? { profileImage: s.profileImage } : {}),
      ...(Array.isArray(s.climbs) && s.climbs.length ? { climbs: s.climbs } : {}),
      ...(Array.isArray(s.sprints) && s.sprints.length ? { sprints: s.sprints } : {}),
      ...(s.pointsAwarded ? { pointsAwarded: s.pointsAwarded } : {}),
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

  const syncStageInfo = (dryRun) => run('stageinfo', async () => {
    const res = await callSyncStageInfo({ dryRun });
    if (!res.ok) throw new Error(res.error);
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
        <h3 style={{ marginBottom: '0.25rem' }}>Etape-info (højdemeter + point)</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--c-muted)', marginTop: 0 }}>
          Henter per-etape <strong>højdemeter (D+)</strong> og hvilke
          klassementer (sprint/bjerg) der uddeler point, fra letour-proxyen.
          Skriver kun <code>elevation</code> + <code>pointsAwarded</code> på
          etaperne — dine spørgsmåls-valg røres ikke. Tør-kør viser resultatet
          uden at gemme.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn--ghost" disabled={busy} onClick={() => syncStageInfo(true)}>
            {busy === 'stageinfo' ? '…' : '🔍 Tør-kør'}
          </button>
          <button className="btn" disabled={busy} onClick={() => syncStageInfo(false)}>
            {busy === 'stageinfo' ? 'Henter…' : '⛰️ Hent etape-info (højdemeter + point)'}
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

      <section style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ marginBottom: '0.25rem' }}>Ekspert-tips pr. etape</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--c-muted)', marginTop: 0 }}>
          AI-genererede ekspert-tips (dansk) vises på etapens præsentationsside.
          Tryk <strong>Generér</strong> for at lave et tip til en enkelt etape,
          eller <strong>Generér manglende</strong> for alle etaper uden tip. Du
          kan redigere teksten frit og trykke <strong>Gem</strong>.
        </p>
        <StageExpertTips season={season} />
      </section>

      {err && <p style={{ color: 'var(--c-err)' }}>{err}</p>}
      <Result data={out} />
    </div>
  );
}
