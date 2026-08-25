/**
 * TroejeOversigt — alle spillets hold med deres tre trøjer.
 *
 * Ligger nederst på "Mit hold", fordi man dér i forvejen skal VÆLGE et hold:
 * oversigten er den hjælp, valget mangler. Den er ikke et katalog for sig selv.
 *
 * TRØJERNE HENTES VIA `badgeFor`, ikke fra rådata. Det er det eneste sted,
 * admin-overrides (`games/{id}.teamStyles`) læses — læste vi holdet direkte,
 * kunne en klub stå i én farve på kampkortet og en anden her, så snart ejeren
 * havde rettet en farve i hånden.
 *
 * HVAD SIDEN IKKE PÅSTÅR. Den siger ikke, at hver farve er efterprøvet. De
 * danske HJEMMEtrøjer er målt på bold.dk (`scripts/superliga-troejefarver.mjs`)
 * og elleve ude-/tredjefelter på klubbernes egne fotos
 * (`scripts/superliga-ude-tredje.mjs`); resten har en kilde, men er ikke målt.
 *
 * DET, SIDEN DERIMOD KAN AFGØRE, er om en 3. trøje nogensinde bliver BRUGT.
 * Det spørgsmål har et præcist svar: kør hele ligaen igennem `matchBadges` og
 * se, om holdets tredjefarve nogensinde bliver valgt. Bliver den aldrig det, er
 * feltet dødvægt — enten fordi det er magen til udetrøjen, eller fordi det
 * aldrig ligger længere fra en modstander.
 *
 * FØRSTE UDGAVE BRUGTE EN TÆRSKEL PÅ 20 I FARVEAFSTAND, og den var både for
 * grov og for fin. Den markerede Coventry (18,6 fra sin udetrøje) og Crystal
 * Palace (1,7 fra sin HJEMMEtrøje) — men begge holds 3. trøjer bliver faktisk
 * brugt, og `matchBadges` sammenligner aldrig et holds tredjefarve med dets
 * egen hjemmefarve. Samtidig overså den Leeds United, hvis to gule (#FFFB00 og
 * #FFCD00) er 27 fra hinanden og dermed slap under radaren, selv om
 * tredjetrøjen aldrig vinder mod nogen modstander. Et tal, jeg selv havde
 * fundet på, gav altså to falske og ét overset. Reglen spørger nu koden.
 */
import { useMemo } from 'react';
import ClubBadge from '../../../components/ClubBadge';
import { badgeFor, matchBadges } from './badges';
import { teamsOf } from './teamInfo';
import { colorDistance } from '../../../lib/contrastText';
import GameTabLink from '../GameTabLink';

const SLOTS = [
  { key: 'home', navn: 'Hjemme' },
  { key: 'away', navn: 'Ude' },
  { key: 'third', navn: '3. trøje' },
];

/**
 * Et konkret eksempel på tredjetrøje-reglen, REGNET UD AF SPILLETS EGNE HOLD.
 *
 * Et håndskrevet eksempel ville blive forkert, næste gang en farve rettes —
 * og det er præcis sket for de tal, der begrundede mønstrene. Her findes parret
 * ved at spørge `matchBadges`, altså den regel teksten beskriver.
 *
 * Vælger det par, hvor skiftet gør mest forskel, så eksemplet er det tydeligste
 * og ikke bare det første i alfabetet.
 *
 * UAFGJORT AFGØRES PÅ NAVNET, ikke på listens rækkefølge. AGF og F.C. København
 * spiller begge i #FFFFFF, så flere par giver PRÆCIS samme gevinst — og så
 * afhang svaret af, om holdene kom sorteret ind eller ej. Komponenten sorterer
 * på visningsnavn, testen gjorde ikke, og de to fik hver sit eksempel. Et
 * eksempel, der skifter med kaldets rækkefølge, er ikke et eksempel.
 */
export function findEksempel(teams, styles) {
  let bedst = null;
  for (const h of teams) {
    for (const a of teams) {
      if (h.name === a.name) continue;
      const { a: valgt } = matchBadges(teams, h.name, a.name, styles);
      const ude = badgeFor(teams, a.name, styles, 'away');
      if (valgt.color === ude.color) continue;      // ingen skift her
      const hjemme = badgeFor(teams, h.name, styles, 'home');
      const gevinst = colorDistance(valgt.color, hjemme.color)
        - colorDistance(ude.color, hjemme.color);
      const navn = `${hjemme.navn}–${valgt.navn}`;
      const bedre = !bedst || gevinst > bedst.gevinst
        || (gevinst === bedst.gevinst && navn.localeCompare(`${bedst.hjemme}–${bedst.ude}`, 'da') < 0);
      if (bedre) {
        bedst = { hjemme: hjemme.navn, ude: valgt.navn, gevinst, hjemmeFarve: hjemme, udeFarve: ude, valgt };
      }
    }
  }
  return bedst;
}

/**
 * Hold, hvis 3. trøje ALDRIG bliver valgt af `matchBadges` i hele ligaen.
 *
 * Ingen tærskel, ingen skønsmæssig farveafstand: spørgsmålet stilles til den
 * regel, der rent faktisk afgør det. Bliver farven aldrig valgt, er feltet
 * dødvægt — og så skal ejeren rette det, ikke gætte på hvorfor.
 */
export function ubrugteTredjetroejer(teams, styles) {
  const ud = new Set();
  for (const a of teams) {
    const tredje = badgeFor(teams, a.name, styles, 'third').color;
    const ude = badgeFor(teams, a.name, styles, 'away').color;
    // Er de ens, KAN skiftet aldrig ses — så tæller det ikke som "brugt".
    const brugt = tredje !== ude && teams.some((h) => h.name !== a.name
      && matchBadges(teams, h.name, a.name, styles).a.color === tredje);
    if (!brugt) ud.add(a.name);
  }
  return ud;
}

export default function TroejeOversigt({ game }) {
  const styles = game?.teamStyles;
  const hold = useMemo(() => {
    if (game?.type !== 'football') return [];
    return [...teamsOf(game)].sort((a, b) => (a.vis || a.name).localeCompare(b.vis || b.name, 'da'));
  }, [game]);

  const eksempel = useMemo(
    () => (hold.length ? findEksempel(hold, styles) : null),
    [hold, styles],
  );
  const ubrugte = useMemo(
    () => (hold.length ? ubrugteTredjetroejer(hold, styles) : new Set()),
    [hold, styles],
  );

  // Gaten er på SPILTYPEN, ikke på holdlisten: `teamsOf` falder tilbage på
  // Superligaens tolv, og det er nøjagtig den liste, holdvælgeren lige over
  // viser. Ellers ville de to sige forskellige ting på det samme kort.
  if (!hold.length) return null;

  return (
    <div className="troejer">
      {/* OVERSKRIFTEN SIGER PRÆCIS, HVAD BLOKKEN ER — ikke "Alle trøjer", som
          ville læses som et facit på klubbernes spilledragter. Den nævner både
          trøjen og kampkortet, altså rækkevidden af påstanden. Spilnavnet står
          ikke her: i et fodboldspil uden egen holdliste ville overskriften
          påstå "…i Premier League" over Superligaens tolv. */}
      <h4 className="troejer__titel">👕 Sådan tegnes trøjerne på kampkortet</h4>

      {/* TEKSTEN HANDLER OM BADGEN, IKKE OM TRØJEN PÅ BANEN. Skrev vi "holdet
          spiller i", modsagde vi tv-billedet: reglen afgør kun, hvilken farve
          KORTET tegner udeholdet i. */}
      <p className="troejer__hjaelp">
        {/* REGLEN LOVER IKKE, AT DE KAN SKELNES. Her stod "…så de to badges kan
            skelnes" — men `matchBadges` skifter kun, HVIS tredjefarven ligger
            længere væk. Hjælper ingen af dem, bliver udetrøjen stående, og de to
            badges ligner stadig hinanden. Modbeviset stod tre rækker længere
            nede på samme skærm. */}
        På kampkortet vises udeholdet i sin udetrøje — men skifter til 3. trøje,
        hvis den ligger længere fra hjemmeholdets farve. Har holdet ingen 3.
        trøje, der hjælper, bliver udetrøjen stående.
        {eksempel && (
          <>
            {' '}Fx <strong>{eksempel.hjemme}–{eksempel.ude}</strong>: dér tegnes{' '}
            {eksempel.ude} i 3. trøje.
          </>
        )}
      </p>

      <ul className="troejer__liste">
        {hold.map((t) => {
          const troejer = SLOTS.map((s) => ({ ...s, b: badgeFor(hold, t.name, styles, s.key) }));
          const doedTredje = ubrugte.has(t.name);
          return (
            <li key={t.name} className="troejer__hold">
              {/* Trøjeoversigten er det ENESTE sted i appen, hvor alle
                  spillets hold står på række — altså det de facto hold-indeks,
                  og den eneste vej til et holds side uden at kende dets kamp. */}
              {t.short ? (
                <GameTabLink fane="elo" hold={t.short} className="troejer__navn">
                  {t.vis || t.name}
                </GameTabLink>
              ) : (
                <span className="troejer__navn">{t.vis || t.name}</span>
              )}
              <span className="troejer__saet">
              {troejer.map(({ key, navn, b }) => (
                <span key={key} className="troejer__et">
                  <ClubBadge
                    variant="troeje" code={b.code} color={b.color} size={30}
                    color2={b.color2} moenster={b.moenster} aerme={b.aerme}
                    title={`${t.vis || t.name} – ${navn}`}
                  />
                  <span className="troejer__mrk">
                    {navn}
                    {/* EN 3. TRØJE, DER ALDRIG BLIVER VALGT, ER DØDVÆGT — og
                        det er en observation om VORES data, ikke en påstand om
                        klubben. Hull City HAR en tredjetrøje i virkeligheden;
                        det er vores farve, der er den samme som udetrøjens. */}
                    {key === 'third' && doedTredje && (
                      <span className="troejer__doed"> · bruges aldrig</span>
                    )}
                  </span>
                </span>
              ))}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
