// ---------------------------------------------------------------------------
// MatchesPage – kampoversigt med tip-formular.
// Sorterer kampe efter kickoff, grupperer visuelt per dag og runde.
// Filtre: Alle / I dag / Kommende / Mine utippede.
// ---------------------------------------------------------------------------
import { useState, useMemo, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useMatches } from '../features/matches/useMatches';
import { useMyBets } from '../features/matches/useMyBets';
import {
  groupMatchesByDay,
  isMatchLocked,
  isTippable,
  dayKey,
  roundLabel,
  findCurrentMatchId,
  isDayGroupPast,
} from '../features/matches/matchHelpers';
import MatchCard from '../features/matches/MatchCard';
import MatchRowCompact from '../features/matches/MatchRowCompact';
import { useStandings } from '../features/leaderboard/useStandings';
import { useLeagues } from '../features/leagues/useLeagues';
import { buildContactLeagues } from '../features/comments/contactLeagues';
import { TIMEZONE } from '../lib/constants';

// Filterkonstanter
const FILTER_ALL = 'alle';
const FILTER_TODAY = 'idag';
const FILTER_UPCOMING = 'kommende';
const FILTER_UNTIPPED = 'utippede';
const VALID_FILTERS = [FILTER_ALL, FILTER_TODAY, FILTER_UPCOMING, FILTER_UNTIPPED];

/** Returnerer dansk dagsnøgle for i dag (til sammenligning). */
function todayKey() {
  return new Intl.DateTimeFormat('da-DK', {
    timeZone: TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
}

export default function MatchesPage() {
  const { user } = useAuth();
  const { matches, loading, error } = useMatches();
  const { bets, loading: betsLoading } = useMyBets(user?.uid ?? null);
  const { standings } = useStandings();
  const [searchParams] = useSearchParams();
  // Tillad dyb-link fra forsiden, fx /kampe?filter=utippede
  const initialFilter = VALID_FILTERS.includes(searchParams.get('filter'))
    ? searchParams.get('filter')
    : FILTER_ALL;
  const [filter, setFilter] = useState(initialFilter);

  // Opslag uid → profil (til avatar/navn i "se alles tips")
  const usersByUid = useMemo(() => {
    const m = {};
    for (const u of standings) m[u.uid] = u;
    return m;
  }, [standings]);

  const uid = user?.uid ?? '';

  // Afslørede tips vises kun for spillere man deler en liga med (+ én selv).
  const { leagues } = useLeagues(uid || null);
  const visibleUids = useMemo(() => {
    const set = new Set(Object.keys(buildContactLeagues(leagues, uid)));
    if (uid) set.add(uid);
    return set;
  }, [leagues, uid]);

  const today = todayKey();

  // Anvend valgt filter på kamplisten
  const filteredMatches = useMemo(() => {
    switch (filter) {
      case FILTER_TODAY:
        return matches.filter((m) => dayKey(m.kickoff) === today);

      case FILTER_UPCOMING:
        return matches.filter((m) => !isMatchLocked(m.kickoff));

      case FILTER_UNTIPPED:
        return matches.filter(
          (m) => isTippable(m) && !bets.has(m.id),
        );

      default:
        return matches;
    }
  }, [matches, filter, bets, today]);

  // Gruppér de filtrerede kampe per dag
  const dayGroups = useMemo(
    () => groupMatchesByDay(filteredMatches),
    [filteredMatches],
  );

  // Del dagene i "tidligere" (foldes sammen) og aktuelle/kommende.
  const { pastGroups, activeGroups } = useMemo(() => {
    const now = new Date();
    const past = [];
    const active = [];
    for (const g of dayGroups) {
      (isDayGroupPast(g, today, now) ? past : active).push(g);
    }
    return { pastGroups: past, activeGroups: active };
  }, [dayGroups, today]);

  // Den aktuelle kamp ud fra uret (live → næste → sidste) – mål for auto-scroll.
  const currentMatchId = useMemo(
    () => findCurrentMatchId(filteredMatches),
    [filteredMatches],
  );

  // Vis/skjul de tidligere kampe (foldet sammen som standard).
  const [showPast, setShowPast] = useState(false);
  const pastCount = useMemo(
    () => pastGroups.reduce((n, g) => n + g.matches.length, 0),
    [pastGroups],
  );

  // Hvilke tidligere kampe er foldet ud til fuldt kort (klik på den kompakte række).
  const [expandedPast, setExpandedPast] = useState(() => new Set());
  const togglePastMatch = (id) =>
    setExpandedPast((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // Tæl utippede kampe til filterlabel (kun kampe der faktisk kan tippes)
  const untippedCount = useMemo(
    () =>
      matches.filter((m) => isTippable(m) && !bets.has(m.id))
        .length,
    [matches, bets],
  );

  const isLoading = loading || betsLoading;

  // Hop direkte til den aktuelle kamp når listen er klar / filteret skifter.
  useEffect(() => {
    if (isLoading) return;
    const el = document.getElementById('aktuel-kamp');
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [isLoading, filter, currentMatchId]);

  // Render én kamp. Tidligere kampe vises kompakt (kun hold + resultat), indtil
  // man klikker dem ud; aktive/kommende — og udfoldede tidligere — vises som fuldt kort.
  const renderMatch = (match, { past }) => {
    const isCurrent = match.id === currentMatchId;
    const wrap = (children) => (
      <div
        key={match.id}
        id={isCurrent ? 'aktuel-kamp' : undefined}
        style={isCurrent ? { scrollMarginTop: '4.5rem' } : undefined}
      >
        {children}
      </div>
    );

    if (past && !expandedPast.has(match.id)) {
      return wrap(
        <MatchRowCompact match={match} onClick={() => togglePastMatch(match.id)} />,
      );
    }
    return wrap(
      <MatchCard
        match={match}
        uid={uid}
        bet={bets.get(match.id) ?? null}
        usersByUid={usersByUid}
        visibleUids={visibleUids}
      />,
    );
  };

  // Render én dag-gruppe (overskrift + runde-undergrupper + kampe).
  // Kampen for den aktuelle kamp får id="aktuel-kamp" (mål for auto-scroll).
  const renderDayGroup = (group, { past = false } = {}) => {
    // Grupper yderligere per runde inden for dagen
    const roundGroups = group.matches.reduce((acc, m) => {
      const key = m.round;
      if (!acc[key]) acc[key] = [];
      acc[key].push(m);
      return acc;
    }, {});

    return (
      <div key={group.label} style={{ marginBottom: '1.5rem' }}>
        {/* Dag-overskrift */}
        <h2
          style={{
            fontSize: '1rem',
            fontWeight: 700,
            color: 'var(--c-pitch)',
            textTransform: 'capitalize',
            margin: '0 0 0.75rem',
            paddingBottom: '0.3rem',
            borderBottom: '2px solid var(--c-pitch)',
            display: 'inline-block',
          }}
        >
          {group.label}
        </h2>

        {/* Runde-undergrupper */}
        {Object.entries(roundGroups).map(([round, roundMatches]) => (
          <div key={round} style={{ marginBottom: '0.75rem' }}>
            {/* Vis rundenavn kun for knockout */}
            {round !== 'group' && (
              <p
                style={{
                  margin: '0 0 0.4rem',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: 'var(--c-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                {roundLabel(round)}
              </p>
            )}
            {roundMatches.map((match) => renderMatch(match, { past }))}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="container">
      <div className="flex items-center justify-between mb-2" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem' }}>⚽ Kampe</h1>
        <Link to="/hjaelp" className="badge badge--blue" style={{ textDecoration: 'none' }}>❓ Sådan får du point</Link>
      </div>

      {/* Filtre */}
      <div className="tabs" style={{ marginBottom: '1rem' }}>
        {[
          { key: FILTER_ALL, label: 'Alle' },
          { key: FILTER_TODAY, label: 'I dag' },
          { key: FILTER_UPCOMING, label: 'Kommende' },
          {
            key: FILTER_UNTIPPED,
            label: `Mine utippede${untippedCount > 0 ? ` (${untippedCount})` : ''}`,
          },
        ].map(({ key, label }) => (
          <button
            key={key}
            className={`tab${filter === key ? ' tab--active' : ''}`}
            onClick={() => setFilter(key)}
            data-testid={`filter-${key}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && <div className="spinner" aria-label="Henter kampe…" />}

      {/* Fejl */}
      {error && (
        <div className="card" style={{ borderColor: 'var(--c-err)', marginBottom: '1rem' }}>
          <p style={{ color: 'var(--c-err)', margin: 0 }}>
            Kunne ikke hente kampe. Tjek din internetforbindelse.
          </p>
        </div>
      )}

      {/* Tom tilstand */}
      {!isLoading && !error && filteredMatches.length === 0 && (
        <div className="empty-state">
          <div className="empty-state__icon">🏟️</div>
          <div className="empty-state__title">
            {filter === FILTER_UNTIPPED
              ? 'Alle tilgængelige kampe er tippet!'
              : 'Ingen kampe fundet'}
          </div>
          <p>
            {filter === FILTER_TODAY
              ? 'Der er ingen kampe i dag.'
              : filter === FILTER_UPCOMING
              ? 'Ingen kommende kampe.'
              : ''}
          </p>
        </div>
      )}

      {/* Tidligere kampe – foldet sammen som standard */}
      {!isLoading && pastGroups.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => setShowPast((v) => !v)}
            aria-expanded={showPast}
            data-testid="toggle-past"
            style={{ marginBottom: showPast ? '1rem' : 0 }}
          >
            {showPast ? '▾ Skjul tidligere kampe' : `▸ Vis tidligere kampe (${pastCount})`}
          </button>
          {showPast && pastGroups.map((g) => renderDayGroup(g, { past: true }))}
        </div>
      )}

      {/* Aktuelle og kommende kampe */}
      {!isLoading && activeGroups.map((g) => renderDayGroup(g, { past: false }))}
    </div>
  );
}
