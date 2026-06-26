// Forhåndsvisning / kontrolside — henter LIVE data fra en valgfri turnering
// (default Bundesliga 2025/26) og viser præcis hvordan topscorere, stilling og
// kampdetaljer kommer til at se ud under VM. Henter intet ind i basen.
import { useState } from 'react';
import { callPreviewFootballData } from './adminActions';
import { TopScorersList } from '../stats/TopScorersCard';
import StandingsTable from '../stats/StandingsTable';
import MatchDetails from '../matches/MatchDetails';

// Et udvalg af turneringer fra jeres abonnement (de 12 tilgængelige).
const COMPETITIONS = [
  { code: 'BL1', name: 'Bundesliga (Tyskland)' },
  { code: 'PL', name: 'Premier League (England)' },
  { code: 'PD', name: 'La Liga (Spanien)' },
  { code: 'SA', name: 'Serie A (Italien)' },
  { code: 'FL1', name: 'Ligue 1 (Frankrig)' },
  { code: 'DED', name: 'Æresdivisionen (Holland)' },
  { code: 'PPL', name: 'Primeira Liga (Portugal)' },
  { code: 'CL', name: 'Champions League' },
];

function SampleMatch({ m }) {
  if (!m) return null;
  const date = m.utcDate ? new Date(m.utcDate).toLocaleDateString('da-DK', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.15rem' }}>📋 Eksempel-kamp</h2>
      <div style={{ fontSize: '0.78rem', color: 'var(--c-muted)', marginBottom: '0.5rem' }}>
        Sådan ser et kampkort ud med fulde detaljer{date ? ` · ${date}` : ''}.
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: 700, fontSize: '1.05rem' }}>
        <span>{m.homeName}</span>
        <span className="badge badge--blue">{m.result ? `${m.result.home}–${m.result.away}` : '—'}</span>
        <span>{m.awayName}</span>
      </div>
      <MatchDetails match={{ details: m.details }} homeName={m.homeName} awayName={m.awayName} />
    </div>
  );
}

export default function PreviewTab() {
  const [code, setCode] = useState('BL1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  async function handleFetch() {
    setBusy(true); setError(''); setData(null);
    const res = await callPreviewFootballData({ code });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setData(res.data);
  }

  const compName = COMPETITIONS.find((c) => c.code === code)?.name ?? code;

  return (
    <div>
      <p style={{ color: 'var(--c-muted)', fontSize: '0.9rem', marginTop: 0 }}>
        Hent ægte data fra en aktiv turnering for at se, hvordan topscorer-ræs, stilling
        og kampdetaljer kommer til at se ud — før VM går i gang. Intet gemmes i basen.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
        <select value={code} onChange={(e) => setCode(e.target.value)} disabled={busy}
          style={{ padding: '0.45rem 0.6rem', borderRadius: 8, border: '1px solid var(--c-border)' }}>
          {COMPETITIONS.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
        <button className="btn" onClick={handleFetch} disabled={busy}>
          {busy ? 'Henter…' : '🔄 Hent forhåndsvisning'}
        </button>
      </div>

      {error && (
        <div role="alert" className="card" style={{ borderColor: 'var(--c-err)', color: 'var(--c-err)', marginBottom: '1rem' }}>
          Fejl: {error}
        </div>
      )}

      {data && (
        <>
          <h2 style={{ fontSize: '1rem', margin: '0 0 0.75rem' }}>Forhåndsvisning: {compName}</h2>
          {data.scorers?.length > 0
            ? <TopScorersList list={data.scorers} title="⚽ Topscorere" />
            : <div className="card" style={{ marginBottom: '1rem', color: 'var(--c-muted)' }}>Ingen topscorer-data{data.scorersError ? ` (${data.scorersError})` : ''}.</div>}
          <StandingsTable tables={data.standings} title="📊 Stilling med form" />
          <SampleMatch m={data.sampleMatch} />
        </>
      )}
    </div>
  );
}
