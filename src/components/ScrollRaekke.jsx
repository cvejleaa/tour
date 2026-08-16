/**
 * ScrollRaekke — en vandret-scrollende række, der VISER, når den gemmer noget.
 *
 * Baggrund (aug. 2026, Safari-rapport "fanerne kommer ikke frem"): .tabs
 * scroller vandret med scrollbaren skjult i ALLE browsere — målt med
 * scripts/fanebredde.mjs var kun 3 af Superligaens 9 faner synlige på en
 * telefon (375-414 px), og intet markerede, at resten fandtes.
 *
 * Mekanikken er en IntersectionObserver på to 1 px-vagter i rækkens ender —
 * IKKE CSS-baggrunds-tricket (background-attachment: local): det har tre
 * TAVSE fejlveje her (rækkerne står på to forskellige baggrunde, skyggen
 * drukner i mørkt tema, og iOS lægger baggrunden på eget lag). En vagt, der
 * ikke kan ses, betyder "der er mere den vej" → rammen får en klasse, og
 * CSS'en (.scrollx i theme.css) tegner en fade i den kant. Klasserne sættes
 * direkte på DOM'en (classList) og ikke via state: scroll ændrer ingen
 * React-data, og en re-render pr. scroll-hændelse ville være spild.
 */
import { useEffect, useRef } from 'react';

export default function ScrollRaekke({ as: Tag = 'div', className, aktivNoegle, children, ...rest }) {
  const ramme = useRef(null);
  const raekke = useRef(null);

  useEffect(() => {
    const scroller = raekke.current;
    const rod = ramme.current;
    // jsdom har ingen IntersectionObserver — så er der heller intet at vise.
    if (!scroller || !rod || typeof IntersectionObserver === 'undefined') return undefined;
    const venstre = scroller.firstElementChild;
    const hoejre = scroller.lastElementChild;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        rod.classList.toggle(
          e.target === venstre ? 'scrollx--venstre' : 'scrollx--hoejre',
          !e.isIntersecting,
        );
      }
    }, { root: scroller, threshold: 0.9 });
    io.observe(venstre);
    io.observe(hoejre);
    return () => io.disconnect();
  }, []);

  // Den aktive fane skal kunne SES: et dybt link (?fane=tabel) må ikke lande
  // med markeringen ude af syne. block: 'nearest' er ikke pynt — uden den
  // defaulter scrollIntoView til block: 'start' og hiver HELE SIDEN op i
  // toppen ved hvert faneskift (QC-fund på planen).
  useEffect(() => {
    if (aktivNoegle == null) return;
    raekke.current?.querySelector('.tab--active')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [aktivNoegle]);

  // Vagterne er 1 px brede flex-børn (CSS: .scrollx__vagt) — usynlige, men
  // observerbare. aria-hidden, så en skærmlæser ikke ser to tomme knapnaboer.
  return (
    <div className="scrollx" ref={ramme}>
      <Tag className={className} ref={raekke} {...rest}>
        <span className="scrollx__vagt" aria-hidden="true" />
        {children}
        <span className="scrollx__vagt" aria-hidden="true" />
      </Tag>
    </div>
  );
}
