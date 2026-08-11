/**
 * GameProfile — din profil I DETTE spil. Pt. dit yndlingshold, som er
 * spil-specifikt (holdene er forskellige fra spil til spil). Vælget gemmes på
 * games/{gameId}/players/{uid}.favoriteTeam og giver din avatar en RING i
 * holdets farve i spillets stilling og ligaer — se `football/useKlubFarver.js`.
 *
 * Ringen og ikke fyldet: fyldet er `avatarColor(uid)`, og det er dét, der
 * skiller spillerne fra hinanden. Indtil videre gjorde valget i øvrigt slet
 * intet uden for det her kort — den her linje beskrev en funktion, der ikke
 * fandtes.
 */
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../../components/Avatar';
import ClubBadge from '../../components/ClubBadge';
import { setPlayerFavoriteTeam } from './gameActions';
import { teamsOf } from './football/teamInfo';
import { badgeFor } from './football/badges';
import { useKlubFarver } from './football/useKlubFarver';
import { useKlubTema } from './useSpilTema';
import TroejeOversigt from './football/TroejeOversigt';

export default function GameProfile({ game, me }) {
  const gameId = game?.id;
  const { user, profile } = useAuth();
  const uid = user?.uid ?? null;

  // Spillets hold (fra spil-dokumentet), ellers Superliga-holdene som fallback.
  //
  // SORTERET PÅ DET VISTE NAVN, ikke på `name`. Listen vises med visningsnavnet
  // ("Nordsjælland"), og sorterede vi på `name` ("FC Nordsjælland"), stod den
  // under F og dermed et tilfældigt sted i en liste, brugeren læser som
  // alfabetisk. Værdien i `<option>` er stadig `name` — det er den, der gemmes
  // i `favoriteTeam` og matches på.
  const teams = useMemo(() => {
    const t = teamsOf(game);
    return [...t].sort((a, b) => (a.vis || a.name).localeCompare(b.vis || b.name, 'da'));
  }, [game]);

  // Ringen om avataren — se useKlubFarver. Følger det VALGTE hold i vælgeren,
  // ikke det gemte, så man kan se farven, før man trykker Gem.
  const klubFarver = useKlubFarver(game);
  // Temaets farve for det hold, man PEGER på. En anden farve end ringens, og
  // det er meningen — se `klubAccentAf` ved siden af `klubFarverAf`.
  const klubTema = useKlubTema(game);
  const [team, setTeam] = useState(me?.favoriteTeam ?? '');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // 'saved' | string | null

  useEffect(() => { setTeam(me?.favoriteTeam ?? ''); }, [me?.favoriteTeam]);

  const chosen = teams.find((t) => t.name === team) || null;
  const temafarve = klubTema(team);
  // Trøjen som kampkortet ville tegne den — inkl. admin-overrides.
  const valgtBadge = useMemo(
    () => (chosen ? badgeFor(teams, chosen.name, game?.teamStyles, 'home') : null),
    [teams, chosen, game?.teamStyles],
  );

  async function save() {
    setBusy(true); setStatus(null);
    const res = await setPlayerFavoriteTeam(uid, gameId, team);
    setStatus(res.ok ? 'saved' : (res.error || 'error'));
    setBusy(false);
  }

  return (
    <div className="card">
      <h3 className="card__title" style={{ marginTop: 0 }}>🙂 Din profil i {game?.name || 'spillet'}</h3>
      {/* TEKSTEN VAR FALSK, INDTIL RINGEN KOM. Her stod ordret, at valget
          "giver din avatar holdets farve i stillingen og i dine ligaer" — men
          `Avatar` brugte kun `favoriteTeam` til et Tour-cykelholds trøjebillede,
          og den kode er slået fra på platformen. Yndlingsholdet gjorde altså
          INTET synligt uden for det her kort. Nu passer sætningen, og den siger
          RING frem for "farve", fordi fyldet stadig er den personlige farve. */}
      {/* TO VIRKNINGER, TO FARVER — og de er med vilje forskellige. Ringen er
          TRØJEN (FCK hvid), temaet er KLUBFARVEN (FCK marineblå). Nævnes kun
          den ene, ser den anden ud som en fejl. Se `klubFarverAf` og
          `klubAccentAf` i football/badges.js. */}
      <p style={{ color: 'var(--c-muted)', marginTop: 0 }}>
        Vælg dit <strong>yndlingshold</strong> i dette spil. Din avatar får trøjens farve som ring
        om sig i stillingen og i dine ligaer, og hele spillet toner over i klubbens farve.
        Holdet gælder kun her — andre spil har deres egne hold, og resten af appen bliver grøn.
      </p>

      <div className="flex items-center" style={{ gap: '0.75rem', margin: '0.5rem 0 1rem' }}>
        {/* NAVN OG EMOJI KOMMER FRA users/{uid}, IKKE FRA SPILLER-DOKUMENTET.
            Her stod `me?.displayName` og `me?.avatarEmoji`. `me` er
            games/{id}/players/{uid}, som kun har `favoriteTeam` — intet i
            koden skriver et navn dertil, og `gameStandings.js` henter da også
            navnene fra en separat users-opslagstabel. Begge felter var derfor
            ALTID undefined, så kortet viste `initials('')` = "?" på en
            hash-farvet cirkel for hver eneste spiller, og en valgt avatar-emoji
            dukkede aldrig op. Ens egen profil var det ene sted i spillet, hvor
            man ikke kunne se sig selv. */}
        {/* `favoriteTeam` sendes IKKE med. Den prop betyder et CYKELHOLD i
            Tour-appen, og `team` her er et fodboldhold — i Tour-tilstand ville
            "Viborg FF" blive slået op i cykelholdene. Klubfarverne har deres
            egen prop netop derfor. */}
        <Avatar
          uid={uid}
          name={profile?.displayName || user?.displayName}
          emoji={profile?.avatarEmoji}
          klubFarver={klubFarver(team)}
          size={48}
        />
        <div>
          <div style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            {/* TRØJEN VIA `badgeFor`, ikke via rådata. Her stod
                `chosen.troejer?.hjemme?.…` direkte, og så slog en admin-rettet
                farve (games/{id}.teamStyles) IKKE igennem — holdet kunne stå i
                én farve på kampkortet og en anden her. `badgeFor` er det ene
                sted, overrides læses. */}
            {chosen && <ClubBadge
              variant="troeje" code={valgtBadge.code} color={valgtBadge.color} size={22}
              color2={valgtBadge.color2} moenster={valgtBadge.moenster}
              aerme={valgtBadge.aerme} title={chosen.name}
            />}
            {chosen ? (chosen.vis || chosen.name) : 'Intet hold valgt'}
          </div>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="game-fav-team">Yndlingshold</label>
        <select
          id="game-fav-team" className="select" value={team}
          onChange={(e) => { setTeam(e.target.value); setStatus(null); }}
          style={{ maxWidth: 280 }}
        >
          <option value="">– Intet valgt –</option>
          {teams.map((t) => <option key={t.name} value={t.name}>{t.vis || t.name}</option>)}
        </select>
      </div>

      <div className="flex items-center" style={{ gap: '0.6rem', marginTop: '0.5rem' }}>
        <button className="btn btn--sm" onClick={save} disabled={busy}>{busy ? 'Gemmer…' : 'Gem'}</button>
        {status === 'saved' && <span className="badge badge--green">Gemt ✓</span>}
        {status && status !== 'saved' && <span className="badge badge--red">{status === 'error' ? 'Kunne ikke gemme.' : status}</span>}
      </div>

      {/* HVAD VALGET GØR VED SIDEN — vist, ikke kun lovet.
          Ringen er trøjen og temaet er klubfarven, og for FCK er de hvid og
          marineblå. Uden en prøve at holde dem op imod ser den ene af dem ud
          som en fejl. Og for et hold UDEN kulør i nogen af de tre trøjer sker
          der ingenting — det skal siges dér, hvor valget træffes, ikke opdages
          bagefter. Crystal Palace står i datafilen med hvid, næsten sort og
          hvid igen. */}
      {chosen && (
        <p className="troejer__mrk" style={{ margin: '0 0 0.75rem' }}>
          {temafarve ? (
            <>
              <span
                aria-hidden="true"
                data-testid="temafarve"
                style={{
                  width: 13, height: 13, borderRadius: 4, display: 'inline-block',
                  verticalAlign: '-1px', marginRight: '0.35rem',
                  background: temafarve.tema.pitch, border: '1px solid var(--c-border)',
                }}
              />
              Spillet tones i klubfarven. Ringen om din avatar er trøjen —
              de to er ikke altid den samme farve.
            </>
          ) : (
            <>
              Ingen af {chosen.vis || chosen.name}s tre trøjer har kulør nok til at tone en hel
              side, så spillet bliver stående i appens grønne. Ringen om din avatar får trøjens
              farve som ellers.
            </>
          )}
        </p>
      )}

      {/* OVERSIGTEN LIGGER HER, fordi man netop her skal vælge et hold — den er
          den hjælp, valget mangler, ikke et katalog for sig selv. */}
      <TroejeOversigt game={game} />
    </div>
  );
}
