/**
 * DriftTab — Admin → 🩺 Driftstatus: kører synk-maskineriet, og er der
 * alarmer, et menneske skal se? Ejeren skal ALDRIG åbne GCP for det her.
 *
 * Kortene tegnes pr. FORVENTET kørsel (afledt af spillene med synk-provider —
 * ikke pr. dokument): en funktion, der aldrig har skrevet, er sit eget kort,
 * ikke et hul i listen. "Forældet" afgøres af serverens egen
 * naesteForventetFoer — klienten gætter aldrig kadencen.
 */
import { httpsCallable } from 'firebase/functions';
import { useState } from 'react';
import { functions } from '../../firebase';
import { useGames } from '../games/useGames';
import { useDriftStatus, ukvitterede } from './useDriftStatus';
import { harKickoffSynk } from '../games/kickoffSync';
import { formatKickoff } from '../../lib/daDate';

const TYPE_NAVN = {
  sweep: 'Times-sweep (facit + tabel)',
  minut: 'Minut-synk (kampdage)',
  kickoff: 'Daglig kickoff-synk',
};

function niveauFarve(niveau) {
  if (niveau === 'fejl') return 'var(--c-err)';
  if (niveau === 'advarsel') return '#b8860b';
  return 'var(--c-pitch)';
}

function StatusKort({ forventet, doc }) {
  const nu = Date.now();
  // Serverens egen forventning afgør "forældet" — mangler dokumentet helt,
  // har kørslen aldrig skrevet (gråt: nyt maskineri afventer første kørsel).
  const forsinket = doc?.naesteForventetFoer != null && nu > doc.naesteForventetFoer;
  const niveau = !doc ? 'afventer' : (forsinket ? 'fejl' : doc.niveau);
  const farve = niveau === 'afventer' ? 'var(--c-muted)' : niveauFarve(niveau);
  return (
    <div className="card" style={{ marginBottom: '0.6rem', borderLeft: `4px solid ${farve}` }}>
      <div className="flex items-center justify-between" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
        {/* Klientens eget navn foretrækkes: serveren kender kun gameId, og
            efter første kørsel må titlen ikke flippe fra navn til råt id. */}
        <strong>{TYPE_NAVN[forventet.type] || forventet.type} · {forventet.gameNavn || doc?.gameNavn}</strong>
        <span className="badge badge--muted" style={{ color: farve, fontWeight: 700 }}>
          {niveau === 'afventer' ? 'afventer første kørsel'
            : forsinket ? 'HAR IKKE KØRT til tiden'
              : niveau === 'ok' ? 'ok' : niveau}
        </span>
      </div>
      {doc ? (
        <>
          <p style={{ whiteSpace: 'pre-line', margin: '0.35rem 0 0', fontSize: '0.9rem' }}>{doc.besked}</p>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--c-muted)', fontSize: '0.78rem' }}>
            {doc.koertAt ? `Sidst kørt (skema): ${formatKickoff(doc.koertAt)}` : 'Skemaet har endnu ikke kørt'}
          </p>
        </>
      ) : (
        <p style={{ margin: '0.35rem 0 0', color: 'var(--c-muted)', fontSize: '0.9rem' }}>
          Har endnu ikke skrevet status — nyt maskineri, eller noget er galt med selve skrivningen
          (så står fejlen i functions-loggen).
        </p>
      )}
    </div>
  );
}

function AlarmKort({ alarm }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const kvitteret = !!alarm.kvitteretAt;
  async function kvitter() {
    setBusy(true); setErr('');
    try {
      await httpsCallable(functions, 'kvitterDriftAlarm')({ alarmId: alarm.id });
    } catch (e) {
      setErr(e?.message || 'Kunne ikke kvittere.');
    }
    setBusy(false);
  }
  return (
    <div className="card" style={{ marginBottom: '0.6rem', borderLeft: `4px solid ${kvitteret ? 'var(--c-muted)' : 'var(--c-err)'}` }}>
      <p style={{ margin: 0, fontSize: '0.9rem', whiteSpace: 'pre-line' }}>{alarm.besked}</p>
      <p style={{ margin: '0.3rem 0 0', color: 'var(--c-muted)', fontSize: '0.78rem' }}>
        Set {alarm.antal} gang{alarm.antal === 1 ? '' : 'e'} · første {formatKickoff(alarm.foersteSetAt)}
        {' · '}seneste {formatKickoff(alarm.sidstSetAt)}
        {kvitteret ? ' · kvitteret' : ''}
      </p>
      {err && <p className="badge badge--red" style={{ marginTop: '0.3rem' }}>{err}</p>}
      {alarm.kraeverKvittering && !kvitteret && (
        <button className="btn btn--sm" style={{ marginTop: '0.4rem' }} disabled={busy} onClick={kvitter}>
          Kvittér — jeg har set den
        </button>
      )}
    </div>
  );
}

export default function DriftTab() {
  const { games } = useGames();
  const { status, alarmer, loading, error } = useDriftStatus();

  // Forventede kørsler afledt af spillenes seedede sync-felt: alle synkede
  // spil har sweep + minut; kun kilder med en kickoff-provider (hentKickoffs)
  // får et kickoff-synk-kort. Spejler SYNCED_GAMES-semantikken via game-
  // dokumenterne. Holdes som ét sæt, så en tredje kilde er én rettelse — ikke
  // endnu et hardkodet provider-navn spredt i fladen (QC-fund: klienten skal
  // følge serveren, ellers står en tavst fejlende synk uden "afventer"-kort).
  const forventede = (games || []).filter((g) => g.sync?.provider).flatMap((g) => [
    { type: 'sweep', gameId: g.id, gameNavn: g.name },
    ...(harKickoffSynk(g) ? [{ type: 'kickoff', gameId: g.id, gameNavn: g.name }] : []),
  ]);
  const docAf = new Map(status.map((d) => [`${d.type}-${d.gameId}`, d]));
  const aabneAlarmer = alarmer.filter((a) => !a.loestAt);
  const skalKvitteres = ukvitterede(alarmer);

  return (
    <div>
      <p style={{ color: 'var(--c-muted)', margin: '0 0 1rem', fontSize: '0.9rem' }}>
        Kører maskineriet — og er der noget, du skal se? Historikken bor i functions-loggen;
        her står kun NU-billedet. Minut-synken skriver kun på kampdage — sweepet er dens alarm.
      </p>

      {error && <p className="badge badge--red">{error}</p>}
      {loading && !error && <p style={{ color: 'var(--c-muted)' }}>Henter…</p>}

      {!loading && !error && (
        <>
          <h3 style={{ margin: '0 0 0.5rem' }}>
            🔔 Alarmer {aabneAlarmer.length === 0 ? '— ingen åbne' : `(${aabneAlarmer.length} åbne, ${skalKvitteres.length} venter på dig)`}
          </h3>
          {aabneAlarmer.map((a) => <AlarmKort key={a.id} alarm={a} />)}

          <h3 style={{ margin: '1rem 0 0.5rem' }}>🩺 Kørsler</h3>
          {forventede.map((f) => (
            <StatusKort key={`${f.type}-${f.gameId}`} forventet={f} doc={docAf.get(`${f.type}-${f.gameId}`)} />
          ))}
          {/* ALLE status-dokumenter uden et forventet kort vises også — ikke
              kun minut-synkens. Driver klientens afledte liste fra serverens
              SYNCED_GAMES (QC-fund), må et rødt dokument aldrig kunne gemme
              sig i hullet: fladen viser hellere et kort for meget end et
              fejl-kort for lidt. Et fraværende minut-dokument er normalt. */}
          {status.filter((d) => !forventede.some((f) => `${f.type}-${f.gameId}` === `${d.type}-${d.gameId}`))
            .map((d) => (
              <StatusKort key={d.id} forventet={{ type: d.type, gameId: d.gameId, gameNavn: d.gameNavn }} doc={d} />
            ))}
        </>
      )}
    </div>
  );
}
