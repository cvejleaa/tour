/**
 * HelpPage — "Sådan virker det". Kort, scanbar forklaring af tip, point,
 * bonus og ligaer. Pointreglerne genbruges fra den centrale PointRules.
 */
import { Link } from 'react-router-dom';
import PointRules from '../components/PointRules';
import { POINTS } from '../lib/scoring';

function Section({ emoji, title, children }) {
  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h2 className="card__title" style={{ marginTop: 0 }}>{emoji} {title}</h2>
      <div style={{ color: 'var(--c-text)', fontSize: '0.92rem', lineHeight: 1.7 }}>{children}</div>
    </div>
  );
}

export default function HelpPage() {
  return (
    <div className="container">
      <h1 style={{ margin: '0 0 1rem', fontSize: '1.4rem' }}>❓ Sådan virker det</h1>

      <Section emoji="⚽" title="Tip kampene">
        Gå til <Link to="/kampe">Kampe</Link> og gæt resultatet for hver kamp. Du kan rette
        dit tip helt indtil <strong>kickoff</strong> – derefter låses det. Find hurtigt de kampe,
        du mangler, under filteret <em>“Mine utippede”</em> eller via <Link to="/">forsidens</Link> “Mine opgaver”.
      </Section>

      <Section emoji="🎯" title="Sådan får du point">
        <PointRules />
      </Section>

      <Section emoji="🎁" title="Bonusspørgsmål">
        På <Link to="/bonus">Bonus</Link> svarer du på spørgsmål som topscorer og gruppevindere.
        Hvert korrekt svar giver <strong>{POINTS.BONUS} point</strong>. Spørgsmålene har deres egen
        deadline og låses derefter.
      </Section>

      <Section emoji="🏆" title="Mini-ligaer">
        På <Link to="/ligaer">Ligaer</Link> kan du oprette en liga (du får en join-kode) eller
        tilmelde dig en eksisterende. I en liga dyster I på en stilling, og ligaens manager kan stille
        <strong> ligaens egne bonusspørgsmål</strong>. Husk at svare på dem – de tæller kun i den liga.
        Mangler du svar i en liga, vises det på forsidens “Mine opgaver”.
      </Section>

      <Section emoji="📋" title="Mine opgaver">
        På <Link to="/">forsiden</Link> samler “Mine opgaver” alt, du mangler at svare på inden deadline:
        utippede kampe, åbne bonusspørgsmål og liga-bonus på tværs af dine ligaer. Tallet i menuen
        viser, hvor meget der mangler i alt.
      </Section>

      <Section emoji="💬" title="Skriv sammen">
        I har to steder at snakke: <Link to="/beskeder">Beskeder</Link> er private 1-til-1-beskeder
        mellem spillere, og hver liga har sin egen <strong>væg</strong>, hvor I kan kommentere og
        sætte emoji-reaktioner. Et rødt tal ved “Beskeder” viser ulæste beskeder.
      </Section>

      <Section emoji="✉️" title="E-mail-påmindelser">
        Du får automatisk en <strong>e-mail-påmindelse</strong> på kampdage, hvis du mangler at tippe.
        Vil du være fri, kan du slå dem fra under <Link to="/profil">Profil</Link> (“Send mig
        e-mail-påmindelser …”).
      </Section>

      <Section emoji="🙂" title="Din profil & avatar">
        På <Link to="/profil">Profil</Link> kan du vælge et <strong>emoji som profilbillede</strong> i
        stedet for dine initialer, sætte dit yndlingshold og styre dine e-mail-præferencer.
      </Section>
    </div>
  );
}
