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
import { setGameSchedule, setGameStatus, setGameJoinable } from '../games/gameActions';
import { callRecomputeGameScores, callBackfillPlayerLeagues, callRepriceGameOdds } from './adminActions';
import { formatKickoff } from '../../lib/daDate';
import { fmtDec } from '../../lib/daNum';
import { GAME_STATUS, GAME_STATUS_VALUES, GAME_STATUS_LABEL } from '../../lib/constants';

// Hvad hver status betyder i praksis — vises under vælgeren, så konsekvensen
// af "Afsluttet" ikke først opdages, når spillet er væk fra oversigten.
const STATUS_HELP = {
  [GAME_STATUS.OPEN]: 'Åbent for tilmelding. Vises under "Åbne spil — deltag", hvis spillet er sat til Synligt nedenfor. Spillerne kan forlade spillet igen — og et forladt spil tager point og liga-medlemskab med sig.',
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
  const [synligBusy, setSynligBusy] = useState(false);
  const [synligFejl, setSynligFejl] = useState(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null); // { kind, text }
  const [prisBusy, setPrisBusy] = useState(false);
  const [prisMsg, setPrisMsg] = useState(null); // { kind, text }
  // Tør-kørslens resultat. Først når det ligger her, må skrive-knappen vises:
  // man skal have SET ændringerne, før man kan udføre dem.
  const [prisPlan, setPrisPlan] = useState(null); // { updated, aendringer }
  // Er planen skrevet? Så bliver tabellen stående som kvittering, men
  // skrive-knappen forsvinder.
  const [prisSkrevet, setPrisSkrevet] = useState(false);

  // Synk felterne når spillet (gen)indlæses. Deps er bevidst PRIMITIVER:
  // game.startAt/puljeLockAt er Timestamp-objekter, som useGames laver forfra
  // ved hver snapshot. Med objekterne i deps ville et ugemt valg blive
  // nulstillet, hver gang noget andet på spil-dokumentet blev skrevet — fx
  // syncSuperligaResults, der opdaterer standings hvert kvarter. Admin ville
  // se sit valg hoppe tilbage uden besked.
  const startMs = toMs(game.startAt);
  const puljeMs = toMs(game.puljeLockAt);
  useEffect(() => {
    setStartAt(toLocalInput(startMs));
    setPuljeLockAt(toLocalInput(puljeMs));
    setGameStatusField(game.status || '');
  }, [startMs, puljeMs, game.status]);

  const isFootball = game.type === 'football';
  // Pulje-deadlinen hører til spil MED en pulje. Uden gaten kunne ejeren i god
  // tro sætte en deadline på Premier League — og så ville et puljetip faktisk
  // blive gemt og senere afregnet mod PL-stillingen, selv om ligaen ikke har
  // et mesterskabsspil. Feltets tilstedeværelse på spillet er signalet.
  const harPulje = Boolean(game.pulje);
  const statusChanged = gameStatus && gameStatus !== game.status;
  // Synlighed læses direkte af spillet — ikke af en lokal kopi. Knappen
  // skriver med det samme, og etiketten vender, når snapshottet kommer
  // tilbage; det ER kvitteringen. Et felt, man skulle huske at gemme, ville
  // gøre "afslør spillet" til to handlinger, hvor den ene er usynlig.
  const synlig = game.joinable === true;
  // joinable læses KUN af "åbne spil"-filteret i splitGames. Et eksternt spil
  // vises altid som link-ud, og et afsluttet spil er altid ude af de åbne — på
  // dem gør feltet ingenting. Uden gaten kunne man klikke "Vis spillet" på et
  // afsluttet spil og få etiketten "Synligt for spillerne", mens status-hjælpen
  // to linjer længere oppe sagde "forsvinder fra Åbne spil — deltag". To
  // nabosætninger, der modsiger hinanden.
  const synlighedStyres = !game.externalUrl && game.status !== GAME_STATUS.FINISHED;

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
    if (harPulje && puljeLockAt !== toLocalInput(toMs(game.puljeLockAt))) {
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

  async function skiftSynlighed() {
    setSynligBusy(true); setSynligFejl(null);
    const res = await setGameJoinable(game.id, !synlig);
    if (!res.ok) setSynligFejl(res.error || 'Kunne ikke ændre spillets synlighed.');
    setSynligBusy(false);
  }

  async function recalc() {
    setRecalcBusy(true); setRecalcMsg(null);
    const res = await callRecomputeGameScores(game.id);
    setRecalcMsg(res.ok
      ? { kind: 'ok', text: `Genberegnet for ${res.data?.players ?? '?'} spillere (${res.data?.gatedMatches ?? 0} kampe før start udeladt).` }
      : { kind: 'err', text: res.error });
    setRecalcBusy(false);
  }

  // Tør-kørsel: hent hvad der VILLE ændre sig, og vis det. Skriver intet.
  async function omprisToer() {
    setPrisBusy(true); setPrisMsg(null); setPrisPlan(null); setPrisSkrevet(false);
    const res = await callRepriceGameOdds({ gameId: game.id, dryRun: true });
    if (!res.ok) { setPrisMsg({ kind: 'err', text: res.error }); setPrisBusy(false); return; }
    setPrisPlan(res.data);
    setPrisMsg(res.data.updated === 0
      ? { kind: 'ok', text: 'Ingen kampe ville ændre sig — oddsene er allerede i takt med modellen.' }
      : { kind: 'ok', text: `Tør-kørsel: ${res.data.updated} kampe ville få nye odds. Se listen nedenfor.` });
    setPrisBusy(false);
  }

  // Skriv for alvor. Kræver en tør-kørsel først — knappen findes ikke før.
  async function omprisSkriv() {
    const n = prisPlan?.updated ?? 0;
    // TEKSTEN SAGDE FØR "Point ændres ikke". Det er forkert, og det er præcis
    // dét, beslutningen handler om: point afregnes af kampens FROSNE odds på
    // kamp-dokumentet, ikke af tippet. Ompriser man en ikke-låst kamp, ændrer
    // man derfor værdien af tips, der ALLEREDE er afgivet — både 1X2-træffet
    // og Chancens udbetaling. Den eneste tekst, en admin læser før et
    // uigenkaldeligt klik, må ikke love det modsatte af, hvad der sker.
    if (!window.confirm(
      `Skriv nye odds på ${n} kampe i "${game.name}"?\n\n`
      + 'Allerede afgivne tips på de kampe afregnes til de NYE odds — også Chancen. '
      + 'Point, der allerede er tildelt for spillede kampe, ændres ikke.\n\n'
      + 'Låste og spillede kampe røres ikke.\n\n'
      + 'Der findes INGEN oddsHistory — det kan ikke fortrydes.',
    )) return;
    setPrisBusy(true); setPrisMsg(null);
    const res = await callRepriceGameOdds({ gameId: game.id, dryRun: false });
    if (!res.ok) { setPrisMsg({ kind: 'err', text: res.error }); setPrisBusy(false); return; }
    // `updated` tælles ens i tør og våd tilstand, så tallet alene kan ikke
    // skelne. Svaret bærer sit eget dryRun — brug DET, ellers kunne admin få
    // "2 kampe har fået nye odds" om en kørsel, der intet skrev.
    setPrisMsg(res.data?.dryRun === false
      ? { kind: 'ok', text: `${res.data.updated} kampe har fået nye odds. Listen nedenfor er kvitteringen — gem den.` }
      : { kind: 'err', text: 'Serveren tørkørte og skrev INTET. Prøv igen.' });
    // Tabellen bliver stående. Den er det eneste spor af, hvad før-oddsene var
    // — der er ingen oddsHistory, og loggen ligger i Cloud Console. Ryddes kun
    // skrive-knappen, så man ikke kan trykke to gange på et forældet grundlag.
    if (res.data?.dryRun === false) setPrisSkrevet(true);
    setPrisBusy(false);
  }

  async function syncLeagues() {
    setSyncBusy(true); setSyncMsg(null);
    const res = await callBackfillPlayerLeagues(game.id);
    setSyncMsg(res.ok
      ? { kind: 'ok', text: `Gennemgik ${res.data?.players ?? '?'} spillere (rettede ${res.data?.changed ?? 0}) og ${res.data?.bets ?? 0} tips (rettede ${res.data?.betsChanged ?? 0}).` }
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

        {harPulje && (
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

      {/* Synlighed. Et nyt spil bliver til i samme sekund, som det kan ses —
          med mindre der findes en måde at holde det tilbage på. Uden knappen
          var den eneste udvej at markere spillet "Afsluttet", og det er
          usandt: påmindelser stopper, og oversigten skriver Afsluttet på et
          spil, der ikke er begyndt. */}
      <div style={{ marginTop: '0.75rem' }}>
        {synlighedStyres ? (
          <>
            <div className="flex items-center" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
              <button
                className="btn btn--ghost btn--sm"
                onClick={skiftSynlighed}
                disabled={synligBusy}
              >
                {synligBusy ? 'Ændrer…' : (synlig ? '🙈 Skjul spillet' : '👁️ Vis spillet')}
              </button>
              <span className={`badge ${synlig ? 'badge--green' : ''}`}>
                {synlig ? 'Synligt for spillerne' : 'Skjult'}
              </span>
              {synligFejl && <span className="badge badge--red">{synligFejl}</span>}
            </div>
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: 'var(--c-muted)' }}>
              {synlig
                ? 'Spillet står under "Åbne spil — deltag" og kan tilmeldes.'
                : 'Skjult: spillet står ikke under "Åbne spil — deltag", så ingen bliver budt ind, mens du gennemgår det.'}
              {' '}
              Skjult betyder KUN &quot;ikke annonceret&quot;: spillet ligger i
              enhver godkendt brugers spil-liste, kampene kan læses af alle
              godkendte, og den der kender adressen kan tilmelde sig. Vil du
              selv gennemgå kampene, så åbn /spil/{game.id} og tilmeld dig —
              en ikke-tilmeldt ser kun et Deltag-kort. Spillere, der allerede
              er tilmeldt, beholder spillet under &quot;Mine spil&quot;.
              Knappen virker med det samme; Gem rører den ikke.
            </p>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--c-muted)' }}>
            {game.externalUrl
              ? 'Synlighed styres ikke her: et eksternt spil vises altid på oversigten som link-ud.'
              : 'Synlighed styres ikke her: et afsluttet spil er altid ude af "Åbne spil — deltag".'}
          </p>
        )}
      </div>

      <div className="flex items-center" style={{ gap: '0.6rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
        <button className="btn btn--sm" onClick={save} disabled={busy}>
          {busy ? 'Gemmer…' : 'Gem'}
        </button>
        {saveMsg === 'saved' && <span className="badge badge--green">Gemt ✓</span>}
        {saveMsg && saveMsg !== 'saved' && <span className="badge badge--red">{saveMsg === 'error' ? 'Kunne ikke gemme.' : saveMsg}</span>}
        <span style={{ fontSize: '0.8rem', color: 'var(--c-muted)' }}>
          Tomt felt = ingen {harPulje ? 'deadline/start' : 'fast start'}.
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

      {/* Ompris kampene med den nuværende odds-model.

          Odds skrives normalt KUN om, når en kamps facit ændrer sig. En ændring
          i modellen ligger derfor død, indtil en tilfældig kamp bliver afgjort
          — og den kamp er som regel selv låst til den tid. Uden denne knap er
          enhver model-rettelse en timing-øvelse. */}
      {isFootball && (
        <div style={{ marginTop: '0.6rem' }}>
          <div className="flex items-center" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
            <button className="btn btn--ghost btn--sm" onClick={omprisToer} disabled={prisBusy}>
              {prisBusy ? 'Regner…' : '💰 Ompris kampene — vis hvad der ændrer sig'}
            </button>
            {prisPlan && prisPlan.updated > 0 && !prisSkrevet && (
              <button className="btn btn--sm" onClick={omprisSkriv} disabled={prisBusy}>
                Skriv de {prisPlan.updated} ændringer
              </button>
            )}
            {prisMsg && (
              <span className={`badge ${prisMsg.kind === 'ok' ? 'badge--green' : 'badge--red'}`}>
                {prisMsg.text}
              </span>
            )}
          </div>
          {prisPlan && prisPlan.updated > 0 && (
            <div style={{ marginTop: '0.5rem', maxHeight: '18rem', overflowY: 'auto', fontSize: '0.85rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--c-muted)' }}>
                    <th style={{ padding: '0.15rem 0.4rem' }}>Rd</th>
                    <th style={{ padding: '0.15rem 0.4rem' }}>Kamp</th>
                    {/* Kickoff er det, beslutningen hænger på: er kampen i
                        aften med på listen eller ej? Dataen lå der i forvejen. */}
                    <th style={{ padding: '0.15rem 0.4rem' }}>Spilles</th>
                    <th style={{ padding: '0.15rem 0.4rem' }}>Før (1/X/2)</th>
                    <th style={{ padding: '0.15rem 0.4rem' }}>Efter (1/X/2)</th>
                  </tr>
                </thead>
                <tbody>
                  {prisPlan.aendringer.map((a) => (
                    <tr key={a.id} style={{ borderTop: '1px solid var(--c-border, #eee)' }}>
                      <td style={{ padding: '0.15rem 0.4rem' }}>{a.round ?? '—'}</td>
                      <td style={{ padding: '0.15rem 0.4rem' }}>{a.home} – {a.away}</td>
                      <td style={{ padding: '0.15rem 0.4rem', color: 'var(--c-muted)' }}>
                        {a.kickoff ? formatKickoff(a.kickoff) : '—'}
                      </td>
                      <td style={{ padding: '0.15rem 0.4rem', color: 'var(--c-muted)' }}>
                        {a.foer ? `${fmtDec(a.foer['1'], 2)} / ${fmtDec(a.foer.X, 2)} / ${fmtDec(a.foer['2'], 2)}` : '—'}
                      </td>
                      <td style={{ padding: '0.15rem 0.4rem' }}>
                        <strong>{fmtDec(a.efter['1'], 2)} / {fmtDec(a.efter.X, 2)} / {fmtDec(a.efter['2'], 2)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Liga-medlemskabet står både på spillerne (hvem ser hvis point) og på
          tippene (hvem ser hvis tip efter kickoff). Serveren holder begge dele
          opdateret — knappen genopbygger dem ud fra ligaernes memberUids. */}
      <div className="flex items-center" style={{ gap: '0.6rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
        <button className="btn btn--ghost btn--sm" onClick={syncLeagues} disabled={syncBusy}>
          {syncBusy ? 'Genopbygger…' : '🔐 Genopbyg liga-adgang til stilling og tips'}
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
