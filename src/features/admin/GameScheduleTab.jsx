/**
 * GameScheduleTab (kun samlet platform) — lad admin/ejer styre HVORNÅR hvert spil
 * går i gang (startAt) og HVORNÅR bonus-/pulje-tippet lukker (puljeLockAt).
 * Bevidst adskilt fra kamp-programmet: bonus-deadline behøver ikke ligge før
 * runde 1 — så der er tid til at få spillere med.
 *
 * Skriver til games/{gameId} (kun admin må skrive — se security rules). Tom
 * dato rydder feltet (ingen deadline / ingen fast start).
 */
import { useEffect, useState } from 'react';
import { useGames } from '../games/useGames';
import { setGameSchedule, setGameStatus } from '../games/gameActions';
import { callRecomputeGameScores, callBackfillPlayerLeagues } from './adminActions';
import { formatKickoff } from '../../lib/daDate';
import { GAME_STATUS, GAME_STATUS_VALUES, GAME_STATUS_LABEL } from '../../lib/constants';

// Hvad hver status betyder i praksis — vises under vælgeren, så konsekvensen
// af "Afsluttet" ikke først opdages, når spillet er væk fra oversigten.
const STATUS_HELP = {
  [GAME_STATUS.OPEN]: 'Åbent for tilmelding. Vises under "Åbne spil — deltag", hvis spillet er joinable. Spillerne kan forlade spillet igen — og et forladt spil tager point og liga-medlemskab med sig.',
  [GAME_STATUS.LIVE]: 'I gang. Påmindelser sendes, og Forlad-knappen er væk.',
  [GAME_STATUS.FINISHED]: 'Afsluttet: forsvinder fra "Åbne spil — deltag", og der sendes ikke flere påmindelser. Stilling og historik kan stadig ses.',
};

/** ms → værdi til <input type="datetime-local"> i LOKAL tid ('YYYY-MM-DDTHH:mm'). */
function toLocalInput(ms) {
  if (ms == null) return '';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Firestore-Timestamp/ms/ISO → ms. */
function toMs(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (v.seconds != null) return v.seconds * 1000;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

function GameRow({ game }) {
  const [startAt, setStartAt] = useState('');
  const [puljeLockAt, setPuljeLockAt] = useState('');
  const [gameStatus, setGameStatusField] = useState('');
  const [busy, setBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null); // 'saved' | 'error' | dansk fejltekst
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [recalcMsg, setRecalcMsg] = useState(null); // { kind, text }
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null); // { kind, text }

  // Synk felterne når spillet (gen)indlæses.
  useEffect(() => {
    setStartAt(toLocalInput(toMs(game.startAt)));
    setPuljeLockAt(toLocalInput(toMs(game.puljeLockAt)));
    setGameStatusField(game.status || '');
  }, [game.startAt, game.puljeLockAt, game.status]);

  const isFootball = game.type === 'football';
  const statusChanged = gameStatus && gameStatus !== game.status;

  async function save() {
    setBusy(true); setSaveMsg(null);
    // Kun de datoer, der faktisk er ændret. datetime-local har kun
    // minut-præcision, så et blindt gem ville nulstille sekunderne på et
    // startAt, ingen havde rørt — fx når man kun kom for at skifte status.
    // Tomt felt → null (ryd).
    const patch = {};
    if (startAt !== toLocalInput(toMs(game.startAt))) {
      patch.startAt = startAt ? new Date(startAt).getTime() : null;
    }
    if (isFootball && puljeLockAt !== toLocalInput(toMs(game.puljeLockAt))) {
      patch.puljeLockAt = puljeLockAt ? new Date(puljeLockAt).getTime() : null;
    }
    const res = Object.keys(patch).length ? await setGameSchedule(game.id, patch) : { ok: true };
    // Status skrives kun når den faktisk er ændret — så en gemt tidsplan ikke
    // rører ved livscyklussen.
    const statusRes = res.ok && statusChanged
      ? await setGameStatus(game.id, gameStatus)
      : { ok: true };
    const failed = !res.ok ? res : (!statusRes.ok ? statusRes : null);
    setSaveMsg(failed ? (failed.error || 'error') : 'saved');
    setBusy(false);
  }

  async function recalc() {
    setRecalcBusy(true); setRecalcMsg(null);
    const res = await callRecomputeGameScores(game.id);
    setRecalcMsg(res.ok
      ? { kind: 'ok', text: `Genberegnet for ${res.data?.players ?? '?'} spillere (${res.data?.gatedMatches ?? 0} kampe før start udeladt).` }
      : { kind: 'err', text: res.error });
    setRecalcBusy(false);
  }

  async function syncLeagues() {
    setSyncBusy(true); setSyncMsg(null);
    const res = await callBackfillPlayerLeagues(game.id);
    setSyncMsg(res.ok
      ? { kind: 'ok', text: `Gennemgik ${res.data?.players ?? '?'} spillere, rettede ${res.data?.changed ?? 0}.` }
      : { kind: 'err', text: res.error });
    setSyncBusy(false);
  }

  return (
    <div className="card mb-2">
      <div className="flex items-center justify-between" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '1rem' }}>
          {game.emoji && <span aria-hidden="true" style={{ marginRight: '0.35rem' }}>{game.emoji}</span>}
          {game.name}
        </strong>
        <span className="badge badge--muted">{game.id}</span>
      </div>

      <div className="grid-2" style={{ gap: '0.75rem', marginTop: '0.75rem' }}>
        <label style={{ display: 'block' }}>
          <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--c-muted)', marginBottom: '0.25rem' }}>
            🚦 Spil-start
          </span>
          <input
            type="datetime-local" value={startAt}
            onChange={(e) => { setStartAt(e.target.value); setSaveMsg(null); }}
            style={{ width: '100%' }}
          />
        </label>

        {isFootball && (
          <label style={{ display: 'block' }}>
            <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--c-muted)', marginBottom: '0.25rem' }}>
              🎖️ Bonus-/pulje-deadline
            </span>
            <input
              type="datetime-local" value={puljeLockAt}
              onChange={(e) => { setPuljeLockAt(e.target.value); setSaveMsg(null); }}
              style={{ width: '100%' }}
            />
          </label>
        )}
      </div>

      {/* Livscyklus. Adskilt fra startAt: et spil kan være gået i gang uden at
          være markeret "I gang", og et spil er ikke afsluttet, bare fordi
          sidste kamp er spillet — det er et bevidst valg, admin træffer. */}
      <label style={{ display: 'block', marginTop: '0.75rem' }}>
        <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--c-muted)', marginBottom: '0.25rem' }}>
          🏁 Status
        </span>
        <select
          value={gameStatus}
          onChange={(e) => { setGameStatusField(e.target.value); setSaveMsg(null); }}
          style={{ width: '100%', maxWidth: '20rem' }}
          aria-label={`Status for ${game.name}`}
        >
          {!game.status && <option value="">— ikke sat —</option>}
          {GAME_STATUS_VALUES.map((s) => (
            <option key={s} value={s}>{GAME_STATUS_LABEL[s]}</option>
          ))}
        </select>
      </label>
      <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: 'var(--c-muted)' }}>
        {STATUS_HELP[gameStatus] ?? 'Vælg spillets tilstand.'}
      </p>

      <div className="flex items-center" style={{ gap: '0.6rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
        <button className="btn btn--sm" onClick={save} disabled={busy}>
          {busy ? 'Gemmer…' : 'Gem'}
        </button>
        {saveMsg === 'saved' && <span className="badge badge--green">Gemt ✓</span>}
        {saveMsg && saveMsg !== 'saved' && <span className="badge badge--red">{saveMsg === 'error' ? 'Kunne ikke gemme.' : saveMsg}</span>}
        <span style={{ fontSize: '0.8rem', color: 'var(--c-muted)' }}>
          Tomt felt = ingen {isFootball ? 'deadline/start' : 'fast start'}.
          {isFootball && puljeLockAt && ` Deadline: ${formatKickoff(new Date(puljeLockAt).getTime())}.`}
        </span>
      </div>

      {/* Genberegn stillingen med den aktuelle start-gate — så tidligere runders
          point fjernes fra totalerne straks efter et start-skift (fodbold). */}
      {isFootball && (
        <div className="flex items-center" style={{ gap: '0.6rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
          <button className="btn btn--ghost btn--sm" onClick={recalc} disabled={recalcBusy}>
            {recalcBusy ? 'Genberegner…' : '🔄 Genberegn point efter start-ændring'}
          </button>
          {recalcMsg && (
            <span className={`badge ${recalcMsg.kind === 'ok' ? 'badge--green' : 'badge--red'}`}>
              {recalcMsg.text}
            </span>
          )}
        </div>
      )}

      {/* Liga-medlemskabet på spillernes dokumenter afgør, hvem der kan se hvis
          point. Serveren holder det opdateret — knappen genopbygger det. */}
      <div className="flex items-center" style={{ gap: '0.6rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
        <button className="btn btn--ghost btn--sm" onClick={syncLeagues} disabled={syncBusy}>
          {syncBusy ? 'Genopbygger…' : '🔐 Genopbyg liga-adgang til stillingen'}
        </button>
        {syncMsg && (
          <span className={`badge ${syncMsg.kind === 'ok' ? 'badge--green' : 'badge--red'}`}>
            {syncMsg.text}
          </span>
        )}
      </div>
    </div>
  );
}

export default function GameScheduleTab() {
  const { games, loading } = useGames();

  if (loading) return <div className="spinner" role="status" aria-label="Indlæser" />;
  if (!games?.length) return <p style={{ color: 'var(--c-muted)' }}>Ingen spil fundet.</p>;

  return (
    <div>
      <p style={{ marginTop: 0, color: 'var(--c-muted)' }}>
        Styr hvornår hvert spil går i gang, og hvornår bonus-/pulje-tippet lukker. Bonus-deadline er
        uafhængig af kamp-programmet — så du kan holde bonus-tippet åbent efter runde 1, indtil flere
        spillere er kommet med.
      </p>
      {games.map((g) => <GameRow key={g.id} game={g} />)}
    </div>
  );
}
