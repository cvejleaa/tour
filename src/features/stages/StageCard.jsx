// ---------------------------------------------------------------------------
// StageCard – én etape med de fire hold-tip-felter (Q1–Q4), låst-tilstand,
// resultat og optjente point. Hold-spillets hjerte.
// ---------------------------------------------------------------------------
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL, TIMEZONE } from '../../lib/constants';
import { scoreStageBet, STAGE_FIELDS, activeQuestionsForStage, stageTipComplete, DEFAULT_PODIUM } from '../../lib/tourScoring';
import { stageStatus } from '../../lib/tourStages';
import { canonicalTeamKey } from '../../lib/tourTeams';
import { prettyTeam } from '../../data/tourTeams2026';
import TeamBadge from '../../components/TeamBadge';
import StageAnswers from './StageAnswers';

const STAGE_TYPE_LABEL = {
  flat: '🟢 Flad', hilly: '🟡 Kuperet', mountain: '🔴 Bjerg',
  itt: '⏱️ Enkeltstart', ttt: '⏱️ Holdtidskørsel', unknown: 'Etape',
};

// De fire spørgsmål i visningsrækkefølge. gcTeam-labellen får antal ryttere
// indsat dynamisk (afhænger af admin-indstillingen gcTopN).
const QUESTIONS = [
  { key: 'winnerTeam', icon: '🏆', label: () => 'Etapevinderens hold' },
  { key: 'gcTeam', icon: '⏱️', label: (gcTopN) => `Bedste hold (de første ${gcTopN} ryttere)` },
  { key: 'mountainTeam', icon: '⛰️', label: () => 'Flest bjergpoint' },
  { key: 'sprintTeam', icon: '🚀', label: () => 'Flest sprintpoint' },
];

function formatDate(kickoff) {
  if (!kickoff) return '';
  const d = kickoff?.toDate ? kickoff.toDate() : new Date(kickoff);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short' });
}

// Tip-frist (lås-tidspunkt) med dato + klokkeslæt i dansk tid — uafhængigt af
// brugerens egen tidszone, så fristen altid vises i Tour-tid (CEST).
function formatDeadline(kickoff) {
  if (!kickoff) return '';
  const d = kickoff?.toDate ? kickoff.toDate() : new Date(kickoff);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('da-DK', {
    timeZone: TIMEZONE,
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  }).format(d);
}

export default function StageCard({
  stage, uid, bet, teams = [], points = {}, gcTopN = 10,
  previousPicks = null, similarStages = [], onApplyToOpenStages = null,
}) {
  const status = stageStatus(stage, Date.now());
  const locked = status !== 'scheduled';
  const isDone = status === 'done';

  // Kun de spørgsmål der faktisk stilles på etapen (type-standard eller override).
  const active = activeQuestionsForStage(stage);
  const shownQuestions = QUESTIONS.filter(({ key }) => active[key]);

  const [picks, setPicks] = useState({
    winnerTeam: bet?.winnerTeam ?? '',
    gcTeam: bet?.gcTeam ?? '',
    mountainTeam: bet?.mountainTeam ?? '',
    sprintTeam: bet?.sprintTeam ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState('');
  const [showAnswers, setShowAnswers] = useState(false);

  useEffect(() => {
    setPicks({
      winnerTeam: bet?.winnerTeam ?? '',
      gcTeam: bet?.gcTeam ?? '',
      mountainTeam: bet?.mountainTeam ?? '',
      sprintTeam: bet?.sprintTeam ?? '',
    });
  }, [bet?.winnerTeam, bet?.gcTeam, bet?.mountainTeam, bet?.sprintTeam]);

  // "Tippet" = alle AKTIVE spørgsmål for etapen er besvaret (samme definition
  // som forsiden og etape-listen, så badges og opgavetæller altid stemmer).
  const hasBet = stageTipComplete(stage, bet);
  const result = isDone ? stage.result : null;
  const scored = result ? scoreStageBet(bet, result, points, active) : null;

  const save = useCallback(async (next) => {
    if (!uid || locked) return;
    setSaving(true);
    setError('');
    try {
      await setDoc(
        doc(db, COL.STAGE_BETS, `${uid}_${stage.id}`),
        { uid, stageId: stage.id, season: stage.season ?? null, ...next, updatedAt: serverTimestamp() },
        { merge: true },
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      console.error('Kunne ikke gemme etape-tip:', e);
      setError('Kunne ikke gemme. Prøv igen.');
    } finally {
      setSaving(false);
    }
  }, [uid, locked, stage.id, stage.season]);

  function onPick(key, value) {
    const next = { ...picks, [key]: value };
    setPicks(next);
    save(next);
  }

  // Et <select> viser kun valget når værdien matcher en option PRÆCIST.
  // Gemte tips kan stamme fra en anden navnevariant af samme hold (resultat-
  // tabellernes ALL-CAPS, alias som "Ineos Grenadiers") — slå derfor op via
  // kanonisk hold-nøgle, så tippet altid vises. Gemmes der igen, normaliseres
  // værdien automatisk til listens navn.
  function selectValue(val) {
    if (!val || teams.includes(val)) return val;
    const k = canonicalTeamKey(val);
    return teams.find((t) => canonicalTeamKey(t) === k) ?? val;
  }

  // Sæt alle fire felter til et givet sæt holdvalg og gem. Bruges af både
  // "kopiér fra forrige etape" og "hent fra lignende etape".
  function copyPicks(src) {
    if (!src) return;
    const next = {
      winnerTeam: src.winnerTeam ?? '',
      gcTeam: src.gcTeam ?? '',
      mountainTeam: src.mountainTeam ?? '',
      sprintTeam: src.sprintTeam ?? '',
    };
    setPicks(next);
    save(next);
  }

  // Kopiér de fire holdvalg fra spillerens seneste tidligere tippede etape.
  function copyFromPrevious() {
    copyPicks(previousPicks);
  }

  // Anvend de aktuelle fire holdvalg på alle åbne etaper (efter bekræftelse).
  async function applyToAllOpen() {
    if (!onApplyToOpenStages || applying) return;
    const ok = window.confirm(
      'Anvend disse 4 hold på alle åbne etaper? Det overskriver dine nuværende tips på de åbne etaper.',
    );
    if (!ok) return;
    setApplying(true);
    setApplyMsg('');
    setError('');
    try {
      const n = await onApplyToOpenStages({ ...picks });
      setApplyMsg(`✓ Anvendt på ${n} åbne etaper`);
      setTimeout(() => setApplyMsg(''), 3000);
    } catch (e) {
      console.error('Kunne ikke anvende på alle åbne etaper:', e);
      setError('Kunne ikke anvende på alle åbne etaper. Prøv igen.');
    } finally {
      setApplying(false);
    }
  }

  const borderColor = locked
    ? (isDone ? 'var(--c-pitch)' : 'var(--c-err)')
    : (hasBet ? 'var(--c-pitch)' : 'var(--c-warn)');

  return (
    <div className="card" data-testid="stage-card" style={{ marginBottom: '0.6rem', borderLeft: `4px solid ${borderColor}` }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.5rem' }}>
        <span style={{ fontWeight: 800 }}>
          Etape {stage.number}
          <span style={{ fontWeight: 600, color: 'var(--c-muted)', marginLeft: '0.5rem', fontSize: '0.85rem' }}>
            {STAGE_TYPE_LABEL[stage.type] || ''}{stage.startCity ? ` · ${stage.startCity} → ${stage.finishCity ?? ''}` : ''}{stage.km != null ? ` · ${stage.km} km` : ''}
          </span>
        </span>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <Link
            to={`/etape/${stage.number}`}
            data-testid="read-about-stage"
            style={{ fontSize: '0.74rem', color: 'var(--c-muted)', textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            📖 Læs om etapen
          </Link>
          {!locked && hasBet && <span className="badge badge--green" style={{ fontSize: '0.72rem' }}>✓ Tippet</span>}
          {!locked && !hasBet && <span className="badge badge--yellow" style={{ fontSize: '0.72rem' }}>Mangler tip</span>}
          <span style={{ fontSize: '0.8rem', color: 'var(--c-muted)' }}>{formatDate(stage.kickoff)}</span>
          {locked && <span className={`badge ${isDone ? 'badge--green' : 'badge--red'}`} style={{ fontSize: '0.72rem' }}>{isDone ? '✓ Afgjort' : '🔒 Låst'}</span>}
        </div>
      </div>

      {/* Tip-frist — kun mens etapen er åben. Tippet låses ved etapestart. */}
      {!locked && stage.kickoff && (
        <div data-testid="stage-deadline" style={{ fontSize: '0.8rem', color: 'var(--c-muted)', marginBottom: '0.5rem' }}>
          ⏳ Tip lukker <strong style={{ color: 'var(--c-text)' }}>{formatDeadline(stage.kickoff)}</strong>
        </div>
      )}

      {/* Optjente point */}
      {scored && (
        <div style={{ marginBottom: '0.5rem' }}>
          <span className={`badge ${scored.points > 0 ? 'badge--green' : 'badge--muted'}`} data-testid="stage-points">
            {scored.points > 0 ? `+${scored.points} point` : `${scored.points} point`}
          </span>
        </div>
      )}

      {/* De fire spørgsmål */}
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {shownQuestions.map(({ key, icon, label }) => {
          const facit = result?.[key];
          const podium = result?.podium?.[key] || (facit ? [facit] : []);
          const earned = scored?.breakdown?.[key] || 0;
          const MEDAL = ['🥇', '🥈', '🥉'];
          // Pointskalaen for spørgsmålet (fx 5·2·1) vises direkte på etapen,
          // så man ikke skal forbi hjælpesiden for at se hvad et tip er værd.
          const scale = (Array.isArray(points[key]) ? points[key] : DEFAULT_PODIUM[key]) || [];
          const scaleShown = scale.filter((p) => Number(p) > 0);
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, minWidth: 200 }}>
                {icon} {label(gcTopN)}
                {!locked && scaleShown.length > 0 && (
                  <span
                    className="badge badge--muted"
                    data-testid={`scale-${key}`}
                    title={`Point hvis dit hold ender som nr. 1/2/3: ${scaleShown.map((p, i) => `${i + 1}. plads ${p} point`).join(', ')}`}
                    style={{ fontSize: '0.64rem', marginLeft: '0.4rem', verticalAlign: 'middle', fontWeight: 700 }}
                  >
                    {scaleShown.join('·')} p
                  </span>
                )}
              </span>
              {locked ? (
                <span style={{ fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                  {picks[key]
                    ? <strong><TeamBadge name={picks[key]} /></strong>
                    : <strong>—</strong>}
                  {podium.length > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', color: 'var(--c-muted)' }}>
                      {podium.map((t, i) => (
                        <span
                          key={t}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.15rem',
                            fontWeight: t === picks[key] ? 800 : 400,
                            color: t === picks[key] ? 'var(--c-ok)' : 'inherit',
                          }}
                        >
                          {MEDAL[i] || `${i + 1}.`} <TeamBadge name={t} />
                        </span>
                      ))}
                      {earned > 0 && <strong style={{ color: 'var(--c-ok)' }}>+{earned}</strong>}
                    </span>
                  )}
                </span>
              ) : (
                <select
                  value={selectValue(picks[key])}
                  disabled={saving}
                  onChange={(e) => onPick(key, e.target.value)}
                  data-testid={`pick-${key}`}
                  style={{ flex: 1, minWidth: 160, padding: '0.4rem', borderRadius: 6, border: '1px solid var(--c-border, #ccc)' }}
                >
                  <option value="">– vælg hold –</option>
                  {teams.map((t) => <option key={t} value={t}>{prettyTeam(t)}</option>)}
                </select>
              )}
            </div>
          );
        })}
      </div>

      {/* Alles svar + etapens top – kun når etapen er afgjort. Lazy: data
          hentes først når man folder ud (så etape-listen forbliver let). */}
      {isDone && (
        <div style={{ marginTop: '0.5rem' }}>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setShowAnswers((v) => !v)}
            aria-expanded={showAnswers}
            data-testid="reveal-stage-answers"
          >
            {showAnswers ? 'Skjul alles svar' : '👀 Se alles svar'}
          </button>
          {showAnswers && <StageAnswers stage={stage} points={points} gcTopN={gcTopN} />}
        </div>
      )}

      {/* Genvejs-handlinger – kun når etapen er åben (redigerbar) */}
      {!locked && (
        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          {/* Skjules helt når der ikke er en tidligere tippet etape at kopiere
              fra (fx etape 1) — en deaktiveret knap uden funktion er dårligere UX. */}
          {previousPicks && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={copyFromPrevious}
              disabled={saving}
              data-testid="copy-previous"
            >
              Kopiér fra forrige etape
            </button>
          )}
          {/* Hent tip fra en allerede-tippet etape af SAMME type. Skjules når
              spilleren ikke har tippet nogen lignende etape endnu. Fungerer som
              en menu: value holdes på "" så pladsholderen altid vises igen. */}
          {similarStages.length > 0 && (
            <select
              value=""
              disabled={saving}
              onChange={(e) => {
                const m = similarStages.find((s) => s.id === e.target.value);
                if (m) copyPicks(m.picks);
              }}
              data-testid="copy-similar"
              style={{ padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid var(--c-border, #ccc)', fontSize: '0.82rem' }}
            >
              <option value="" disabled>Hent tip fra lignende etape…</option>
              {similarStages.map((s) => (
                <option key={s.id} value={s.id}>
                  {`Etape ${s.number}${s.startCity ? ` · ${s.startCity} → ${s.finishCity}` : ''}`}
                </option>
              ))}
            </select>
          )}
          {onApplyToOpenStages && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={applyToAllOpen}
              disabled={applying || saving}
              data-testid="apply-all-open"
            >
              {applying ? 'Anvender…' : 'Anvend på alle åbne etaper'}
            </button>
          )}
        </div>
      )}

      {applyMsg && <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', color: 'var(--c-ok)' }} data-testid="apply-msg">{applyMsg}</p>}
      {saved && <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', color: 'var(--c-ok)' }}>✓ Gemt!</p>}
      {error && <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', color: 'var(--c-err)' }}>{error}</p>}
      {!locked && (
        <p style={{ margin: '0.4rem 0 0', fontSize: '0.74rem', color: 'var(--c-muted)' }}>
          Op til {STAGE_FIELDS.reduce((sum, { key, points: pk }) => {
            if (!active[key]) return sum;
            const scale = Array.isArray(points[pk]) ? points[pk] : DEFAULT_PODIUM[pk];
            return sum + (scale[0] ?? DEFAULT_PODIUM[pk][0]);
          }, 0)} point · tallene ved hvert spørgsmål er point for 1./2./3.-plads · gemmes automatisk · låses ved etapestart
        </p>
      )}
      {/* Detaljer om etapen ligger på præsentationssiden (📖 Læs om etapen). */}
    </div>
  );
}
