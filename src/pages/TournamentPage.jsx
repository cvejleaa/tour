// ---------------------------------------------------------------------------
// TournamentPage – Kampplan og stilling for grupper, mellemrunde og slutspil.
// Opdateres live via useMatches() (onSnapshot).
// ---------------------------------------------------------------------------
import { useMemo, useState } from 'react';
import { useMatches } from '../features/matches/useMatches';
import { useAuth } from '../context/AuthContext';
import { useBonusQuestions, useMyBonusBets } from '../features/bonus/useBonusData';
import { computeGroupStandings, grupperEfterGruppe } from '../features/tournament/computeStandings';
import { roundLabel, formatKickoffTime, formatKickoffDate, dayKey } from '../features/matches/matchHelpers';
import { teamName } from '../lib/teams';
import { ROUNDS, MATCH_STATUS, BONUS_TYPE } from '../lib/constants';
import Flag from '../components/Flag';
import TeamLink from '../components/TeamLink';
import { TopScorersList } from '../features/stats/TopScorersCard';
import { useTopScorers } from '../features/stats/useTopScorers';
import DisciplineCard from '../features/stats/DisciplineCard';
import FieryRefereeCard from '../features/stats/FieryRefereeCard';
import GoalIntervalCard from '../features/stats/GoalIntervalCard';
import TournamentFactsCard from '../features/stats/TournamentFactsCard';
import SecondHalfCard from '../features/stats/SecondHalfCard';
import { computeDiscipline, computeTournamentFacts } from '../features/stats/statsUtils';
import '../features/tournament/tournament.css';

// ─── Konstanter ────────────────────────────────────────────────────────────

const FANER = [
  { id: 'grupper',     label: 'Grupper' },
  { id: 'mellemrunde', label: 'Mellemrunde' },
  { id: 'slutspil',    label: 'Slutspil' },
  { id: 'topscorere',  label: 'Topscorere' },
  { id: 'disciplin',   label: 'Disciplin' },
  { id: 'fakta',       label: 'Fakta' },
];

// Rækkefølgen vi viser knockout-runder i slutspil
const SLUTSPIL_RUNDER = [ROUNDS.R16, ROUNDS.QF, ROUNDS.SF, ROUNDS.BRONZE, ROUNDS.FINAL];

// ─── Hjælpekomponenter ─────────────────────────────────────────────────────

/**
 * Stillingslinje for én gruppe (tabel + kampprogram).
 */
function GruppeKort({ gruppenavn, kampe, myWinner }) {
  const stilling = computeGroupStandings(kampe);

  return (
    <div className="card" style={{ padding: '1rem' }}>
      {/* Gruppeoverskrift */}
      <div className="card__header" style={{ marginBottom: '0.75rem' }}>
        <h3 className="card__title" style={{ fontSize: '1rem' }}>
          Gruppe {gruppenavn}
        </h3>
      </div>

      {/* Stillingslabel-forklaring */}
      <div className="table-wrap" style={{ marginBottom: '0.85rem' }}>
        <table className="table table--compact" style={{ fontSize: '0.82rem' }}>
          <thead>
            <tr>
              <th style={{ width: '1.8rem', paddingLeft: '0.5rem' }}>#</th>
              <th>Hold</th>
              <th className="text-center">K</th>
              <th className="text-center">V</th>
              <th className="text-center">U</th>
              <th className="text-center">T</th>
              <th className="text-center">M</th>
              <th className="text-center">MD</th>
              <th className="text-center" style={{ color: 'var(--c-pitch)' }}>P</th>
            </tr>
          </thead>
          <tbody>
            {stilling.map((række, idx) => {
              const gårVidere = idx < 2;
              return (
                <tr
                  key={række.team}
                  className={gårVidere ? 'standings-row--advance' : ''}
                >
                  <td style={{ paddingLeft: '0.5rem' }}>
                    <span className={`standings-pos ${gårVidere ? 'standings-pos--advance' : 'standings-pos--normal'}`}>
                      {idx + 1}
                    </span>
                  </td>
                  <td>
                    <TeamLink code={række.team} style={{ display: 'inline-flex' }}>
                    <span className="team-cell">
                      <Flag code={række.team} size={20} />
                      {/* Fuldt navn når kortet er bredt nok, ellers landekode */}
                      <span className="gstand-name-long" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                        {teamName(række.team)}
                      </span>
                      <span className="gstand-name-short" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                        {række.team}
                      </span>
                    </span>
                    </TeamLink>
                    {myWinner === række.team && (
                      <span
                        className="badge badge--yellow"
                        data-testid="my-group-winner"
                        title="Dit gæt på gruppevinder"
                        style={{ marginLeft: 6, fontSize: '0.64rem', whiteSpace: 'nowrap' }}
                      >
                        ⭐ Dit gæt
                      </span>
                    )}
                  </td>
                  <td className="text-center text-muted">{række.played}</td>
                  <td className="text-center">{række.won}</td>
                  <td className="text-center">{række.drawn}</td>
                  <td className="text-center">{række.lost}</td>
                  <td className="text-center text-muted">{række.gf}–{række.ga}</td>
                  <td className="text-center text-muted">
                    {række.gd > 0 ? `+${række.gd}` : række.gd}
                  </td>
                  <td className="text-center">
                    <span className="pts">{række.points}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Kampprogram for gruppen */}
      <div>
        <p className="text-sm text-muted" style={{ marginBottom: '0.4rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Kampe
        </p>
        {kampe.map((kamp) => {
          const erAfsluttet = kamp.status === MATCH_STATUS.FINISHED;
          const harResultat = erAfsluttet && kamp.result != null;
          const erLive = kamp.status === MATCH_STATUS.LIVE;

          return (
            <div key={kamp.id} className="group-match">
              {/* Hjemmehold */}
              <TeamLink code={kamp.homeTeam} style={{ display: 'flex' }}>
                <div className="group-match__team">
                  <Flag code={kamp.homeTeam} size={20} />
                  <span className="group-match__team-name">
                    <span className="team-name-long">{teamName(kamp.homeTeam)}</span>
                    <span className="team-name-short">{kamp.homeTeam}</span>
                  </span>
                </div>
              </TeamLink>

              {/* Dato + resultat/tid */}
              <div className="group-match__center">
                <span className="group-match__date">{formatKickoffDate(kamp.kickoff)}</span>
                <div className="group-match__score">
                  {harResultat ? (
                    <>
                      <span className="group-match__score-num">{kamp.result.home}</span>
                      <span className="group-match__score-sep">–</span>
                      <span className="group-match__score-num">{kamp.result.away}</span>
                    </>
                  ) : erLive ? (
                    <span className="badge badge--red match-status-badge">LIVE</span>
                  ) : (
                    <span className="group-match__time">{formatKickoffTime(kamp.kickoff)}</span>
                  )}
                </div>
              </div>

              {/* Udehold */}
              <TeamLink code={kamp.awayTeam} style={{ display: 'flex' }}>
                <div className="group-match__team group-match__team--away">
                  <span className="group-match__team-name" style={{ textAlign: 'right' }}>
                    <span className="team-name-long">{teamName(kamp.awayTeam)}</span>
                    <span className="team-name-short">{kamp.awayTeam}</span>
                  </span>
                  <Flag code={kamp.awayTeam} size={20} />
                </div>
              </TeamLink>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Viser ét knockout-kampkort (bruges i mellemrunde og slutspil).
 */
function KnockoutKampKort({ kamp }) {
  const erAfsluttet = kamp.status === MATCH_STATUS.FINISHED;
  const harResultat = erAfsluttet && kamp.result != null;
  const erLive = kamp.status === MATCH_STATUS.LIVE;

  // Afgør vinder (ved resultat)
  let hjemmeVinder = false;
  let udeVinder = false;
  if (harResultat) {
    // Advance-felt angiver vinder ved uafgjort (straffe/forlænget)
    if (kamp.result.advance) {
      hjemmeVinder = kamp.result.advance === kamp.homeTeam;
      udeVinder = kamp.result.advance === kamp.awayTeam;
    } else {
      hjemmeVinder = kamp.result.home > kamp.result.away;
      udeVinder = kamp.result.away > kamp.result.home;
    }
  }

  return (
    <div className="ko-match">
      {/* Hjemmehold */}
      <div className={`ko-match__team ${hjemmeVinder ? 'ko-match__team--winner' : ''}`}>
        <div className="ko-match__team-info">
          {kamp.homeTeam ? (
            <TeamLink code={kamp.homeTeam} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              <Flag code={kamp.homeTeam} size={22} />
              <span className="ko-match__team-name">{teamName(kamp.homeTeam)}</span>
            </TeamLink>
          ) : (
            <span className="ko-match__team-name ko-match__team-name--placeholder">
              {kamp.homePlaceholder || 'TBD'}
            </span>
          )}
        </div>
        <span className="ko-match__score">
          {harResultat ? kamp.result.home : '–'}
        </span>
      </div>

      <div className="ko-match__divider" />

      {/* Udehold */}
      <div className={`ko-match__team ${udeVinder ? 'ko-match__team--winner' : ''}`}>
        <div className="ko-match__team-info">
          {kamp.awayTeam ? (
            <TeamLink code={kamp.awayTeam} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              <Flag code={kamp.awayTeam} size={22} />
              <span className="ko-match__team-name">{teamName(kamp.awayTeam)}</span>
            </TeamLink>
          ) : (
            <span className="ko-match__team-name ko-match__team-name--placeholder">
              {kamp.awayPlaceholder || 'TBD'}
            </span>
          )}
        </div>
        <span className="ko-match__score">
          {harResultat ? kamp.result.away : '–'}
        </span>
      </div>

      {/* Metainfo: tid + eventuel live-badge */}
      <div className="ko-match__meta" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.3rem' }}>
        <span>{formatKickoffDate(kamp.kickoff)} kl. {formatKickoffTime(kamp.kickoff)}</span>
        {kamp.city && <span>· {kamp.city}</span>}
        {erLive && (
          <span className="badge badge--red match-status-badge">LIVE</span>
        )}
        {erAfsluttet && kamp.result?.advance && (
          <span className="badge badge--green match-status-badge" style={{ marginLeft: 'auto' }}>
            {teamName(kamp.result.advance) || kamp.result.advance} videre
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Fane-indhold ──────────────────────────────────────────────────────────

/**
 * Grupper-fane: stillingskort for alle grupper A–L.
 */
function GrupperFane({ matches, myGroupWinners }) {
  const gruppeKampe = matches.filter((m) => m.round === ROUNDS.GROUP);
  const gruppeMap = grupperEfterGruppe(gruppeKampe);

  if (gruppeMap.size === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">⚽</div>
        <div className="empty-state__title">Ingen gruppekampe endnu</div>
        <p className="text-muted text-sm">Kampene opdateres automatisk.</p>
      </div>
    );
  }

  return (
    <div className="groups-grid">
      {[...gruppeMap.entries()].map(([navn, kampe]) => (
        <GruppeKort key={navn} gruppenavn={navn} kampe={kampe} myWinner={myGroupWinners?.[navn]} />
      ))}
    </div>
  );
}

/**
 * Mellemrunde-fane: 1/16-finalerne (round === 'r32').
 * Kampe grupperet efter dato.
 */
function MellemrundeFane({ matches }) {
  const mellemrundeKampe = matches.filter((m) => m.round === ROUNDS.R32);

  if (mellemrundeKampe.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">🏆</div>
        <div className="empty-state__title">Mellemrunden er ikke fastlagt endnu</div>
        <p className="text-muted text-sm">Hold og tider vises når gruppespillet er afsluttet.</p>
      </div>
    );
  }

  // Gruppér efter dag
  const dagMap = new Map();
  for (const kamp of mellemrundeKampe) {
    const dag = dayKey(kamp.kickoff);
    if (!dagMap.has(dag)) dagMap.set(dag, []);
    dagMap.get(dag).push(kamp);
  }

  return (
    <div>
      {[...dagMap.entries()].map(([dag, dagKampe]) => (
        <div key={dag}>
          <p className="round-day-label">{dag}</p>
          <div className="bracket-round__matches">
            {dagKampe.map((kamp) => (
              <KnockoutKampKort key={kamp.id} kamp={kamp} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Slutspil-fane: r16 → qf → sf → bronze → final.
 * Vist som bracket-inspireret oversigt pr. runde.
 */
function SlutspilFane({ matches }) {
  const slutspilKampe = matches.filter((m) => SLUTSPIL_RUNDER.includes(m.round));

  if (slutspilKampe.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">🥇</div>
        <div className="empty-state__title">Slutspillet er ikke fastlagt endnu</div>
        <p className="text-muted text-sm">Hold og tider vises når mellemrunden er afsluttet.</p>
      </div>
    );
  }

  return (
    <div>
      {SLUTSPIL_RUNDER.map((runde) => {
        const rundeKampe = slutspilKampe.filter((m) => m.round === runde);
        if (rundeKampe.length === 0) return null;

        // Finale og bronzekamp får lidt ekstra fremhævning
        const erFinale = runde === ROUNDS.FINAL;
        const erBronze = runde === ROUNDS.BRONZE;

        return (
          <div key={runde} className="bracket-round">
            <div
              className="bracket-round__title"
              style={erFinale ? { color: 'var(--c-accent-2)', borderBottomColor: 'var(--c-accent-2)' } : {}}
            >
              {erFinale ? '🏆 ' : erBronze ? '🥉 ' : ''}{roundLabel(runde)}
            </div>
            <div className="bracket-round__matches">
              {rundeKampe.map((kamp) => (
                <KnockoutKampKort key={kamp.id} kamp={kamp} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Topscorere-fane: turneringens målscorere fra football-data.org.
 */
function TopscorereFane() {
  const { list, updatedAt, loading } = useTopScorers();

  if (loading) {
    return <p className="text-center text-muted text-sm">Henter topscorere…</p>;
  }
  if (!list || list.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">⚽</div>
        <div className="empty-state__title">Ingen topscorere endnu</div>
        <p className="text-muted text-sm">Listen fyldes, så snart der scores mål.</p>
      </div>
    );
  }
  return <TopScorersList list={list} updatedAt={updatedAt} limit={20} />;
}

/**
 * Disciplin-fane: flest gule/røde kort pr. hold og spiller.
 */
function DisciplinFane({ matches }) {
  const { totals } = computeDiscipline(matches);

  if (totals.yellow === 0 && totals.red === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">🟨</div>
        <div className="empty-state__title">Ingen kort endnu</div>
        <p className="text-muted text-sm">Disciplin-oversigten fyldes, når der vises kort.</p>
      </div>
    );
  }
  return (
    <>
      <DisciplineCard matches={matches} limit={10} />
      <FieryRefereeCard matches={matches} />
    </>
  );
}

/**
 * Fakta-fane: turneringsstatistik (mål pr. minut-interval, nøgletal, 2. halvleg).
 */
function FaktaFane({ matches }) {
  const facts = computeTournamentFacts(matches);

  if (facts.played === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">📊</div>
        <div className="empty-state__title">Ingen fakta endnu</div>
        <p className="text-muted text-sm">Statistikken fyldes, så snart de første kampe er spillet.</p>
      </div>
    );
  }
  return (
    <>
      <TournamentFactsCard matches={matches} />
      <GoalIntervalCard matches={matches} />
      <SecondHalfCard matches={matches} />
    </>
  );
}

// ─── Hoved-komponent ───────────────────────────────────────────────────────

export default function TournamentPage() {
  const { matches, loading, error } = useMatches();
  const { user } = useAuth();
  const { questions } = useBonusQuestions();
  const { bonusBets } = useMyBonusBets(user?.uid ?? null);
  const [aktivFane, setAktivFane] = useState('grupper');

  // Mit gæt på gruppevinder pr. gruppe (fra bonus-spørgsmål): gruppenavn → holdkode.
  const myGroupWinners = useMemo(() => {
    const out = {};
    for (const q of questions) {
      if (q.type === BONUS_TYPE.GROUP_WINNER && q.groupName) {
        const answer = bonusBets.get(q.id)?.answer;
        if (answer) out[q.groupName] = answer;
      }
    }
    return out;
  }, [questions, bonusBets]);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="container">
        <div className="spinner" aria-label="Indlæser turnering…" />
        <p className="text-center text-muted text-sm">Indlæser kampplan…</p>
      </div>
    );
  }

  // ── Fejl ─────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="container">
        <div className="card">
          <p className="text-muted text-center">
            Kunne ikke hente kampdata. Prøv igen om lidt.
          </p>
        </div>
      </div>
    );
  }

  // ── Ingen kampe endnu ────────────────────────────────────────────────────
  if (matches.length === 0) {
    return (
      <div className="container">
        <div className="empty-state">
          <div className="empty-state__icon">⚽</div>
          <div className="empty-state__title">Ingen kampe fundet</div>
          <p className="text-muted text-sm">Kampplanen er ikke indlæst endnu.</p>
        </div>
      </div>
    );
  }

  // ── Hoved-render ─────────────────────────────────────────────────────────
  return (
    <div className="container">
      {/* Sideoverskrift */}
      <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '1rem', marginTop: 0 }}>
        Turnering
      </h1>

      {/* Fane-navigation */}
      <div className="tabs" role="tablist">
        {FANER.map((fane) => (
          <button
            key={fane.id}
            className={`tab ${aktivFane === fane.id ? 'tab--active' : ''}`}
            role="tab"
            aria-selected={aktivFane === fane.id}
            onClick={() => setAktivFane(fane.id)}
          >
            {fane.label}
          </button>
        ))}
      </div>

      {/* Fane-indhold */}
      {aktivFane === 'grupper' && (
        <GrupperFane matches={matches} myGroupWinners={myGroupWinners} />
      )}
      {aktivFane === 'mellemrunde' && (
        <MellemrundeFane matches={matches} />
      )}
      {aktivFane === 'slutspil' && (
        <SlutspilFane matches={matches} />
      )}
      {aktivFane === 'topscorere' && (
        <TopscorereFane />
      )}
      {aktivFane === 'disciplin' && (
        <DisciplinFane matches={matches} />
      )}
      {aktivFane === 'fakta' && (
        <FaktaFane matches={matches} />
      )}
    </div>
  );
}
