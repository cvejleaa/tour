'use strict';
// ---------------------------------------------------------------------------
// inviteTemplate.js — HTML-skabelon for spil-invitationen (Send mail).
// Spejler Tour-salgstalens design: grøn hero, hvide kort, skærmbilleder fra
// sitet (public/salgstale/*.png) og en gul tilmeldingsblok med ligaens
// ét-kliks-link. Admins egen tekst (inkl. tilbageblik/top 5) står øverst.
// Mailen skal præsentere HELE spillet: runde-tippet er hovedretten, mens
// bonusserne, puljen, ligaen og ranglisten står som sidestillede kapitler.
//
// SKABELONEN FØLGER SPILLET (aug. 2026): den første udgave var hardcodet til
// Superligaen, så PL-launch-mailen lovede et pulje-tip, spillet ikke har, og
// viste Brøndby-kampe under en Premier League-overskrift. ligaProfil() afleder
// alt af SPIL-DOKUMENTET (pulje er data, ikke en liga-liste) plus en lille
// provider-profil for navn/overskrift/billeder. Et billede fra den forkerte
// liga er værre end intet billede: stierne står KUN i profilen for de ligaer,
// hvis skærmbilleder faktisk ligger i public/salgstale/.
// Rene funktioner — testbare uden Firebase.
// ---------------------------------------------------------------------------

const FONT = "Arial,Helvetica,'Segoe UI',sans-serif";

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function featureRow({ n, title, text, last }) {
  return `
  <tr><td style="padding:10px 0 ${last ? 0 : 10}px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      <td width="34" valign="top">
        <div style="font-family:${FONT};width:26px;height:26px;line-height:26px;text-align:center;background:#0b6e4f;color:#ffffff;font-weight:bold;border-radius:50%;font-size:14px;">${n}</div>
      </td>
      <td style="font-family:${FONT};font-size:14px;line-height:21px;color:#28362f;">
        <b style="color:#12211b;">${title}</b><br>${text}
      </td>
    </tr></table>
  </td></tr>`;
}

/** Hvidt kort: overskrift, brødtekst/punkter og (valgfrit) et skærmbillede nederst. */
function card({ kicker, title, body, rows, img, imgAlt, imgWidth = 430 }) {
  return `
  <tr><td style="padding:0 0 22px 0;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:600px;background:#ffffff;border:1px solid #e3ece8;">
      <tr><td style="padding:22px 26px ${img ? 8 : 18}px 26px;font-family:${FONT};">
        <div style="font-family:${FONT};font-size:12px;font-weight:bold;color:#0b6e4f;letter-spacing:1px;text-transform:uppercase;">${kicker}</div>
        <div style="font-family:${FONT};font-size:22px;font-weight:bold;color:#12211b;padding:6px 0 4px 0;">${title}</div>
        ${body ? `<div style="font-family:${FONT};font-size:15px;line-height:22px;color:#28362f;padding:0 0 ${rows ? 4 : 10}px 0;">${body}</div>` : ''}
        ${rows ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>` : ''}
      </td></tr>
      ${img ? `<tr><td style="padding:0;border-top:1px solid #e3ece8;" bgcolor="#fbfdfc" align="center">
        <img src="${img}" alt="${imgAlt}" width="${imgWidth}" style="width:${imgWidth}px;max-width:100%;display:block;border:0;margin:0 auto;" />
      </td></tr>` : ''}
    </table>
  </td></tr>`;
}

/**
 * Er invitations-kaldet gyldigt? Returnerer en dansk fejltekst eller null.
 *
 * REN funktion, så vagterne kan mutationstestes — i index.js var de kun
 * ledning, og en ledningsvagt kan fjernes med grøn suite (Security-fund):
 * - joinLink SKAL ligge under vores eget domæne. startsWith(APP_URL) alene
 *   slap 'https://tip.vejleaa.dk.evil.dk/…' og '…dk@evil.dk' igennem
 *   (bekræftet PoC) — kravet er domænet MED skråstreg.
 * - 'invitation' KRÆVER gameId (ellers faldt den tavst tilbage til
 *   Superligaens mail — om et hvilket som helst spil). 'superliga' er den
 *   bagudkompatible vej uden gameId (gamle, åbne klienter).
 * - gameId skal ligne et dokument-id: 'a/b/c' rammer en subcollection, og
 *   '.'/'..' vælter Firestore-SDK'et med en ubehandlet fejl.
 */
const GAME_ID_RE = /^[A-Za-z0-9_-]{1,200}$/;
function invitationsFejl({ template, joinLink, gameId, appUrl = 'https://tip.vejleaa.dk' } = {}) {
  if (!String(joinLink || '').startsWith(`${appUrl}/`)) {
    return 'Skabelonen kræver et tilmeldingslink på tip.vejleaa.dk.';
  }
  if (template === 'invitation' && !gameId) {
    return 'Invitationen kræver et valgt spil (gameId).';
  }
  if (gameId && !GAME_ID_RE.test(String(gameId))) {
    return 'Ugyldigt spil-id til invitationen.';
  }
  return null;
}

/**
 * Afled invitations-profilen af et SPIL-dokument. null/udeladt → Superligaens
 * profil (bagudkompatibelt: gamle klienter sender intet gameId).
 *
 * Pulje-kapitlet følger game.pulje (data), aldrig provideren: den dag et spil
 * uden pulje får én, følger mailen med af sig selv. Billedstier står kun for
 * ligaer med committede skærmbilleder i public/salgstale/ — en død <img> i en
 * mail er værre end et kort uden billede.
 */
function ligaProfil(game) {
  const harPulje = !!game?.pulje;
  const poolSize = Number(game?.pulje?.poolSize) || 6;
  // typeof-vagter, ikke String(...): et lovligt Firestore-map {toString:null}
  // ville få String() til at kaste (Security-PoC). Loftet spejler leagueName.
  const spilNavn = typeof game?.name === 'string' ? game.name.slice(0, 60) : '';
  if (game?.sync?.provider === 'pulselive') {
    // Efterårs-spillet er 18 runder — sig det som en FORDEL (lavt commitment,
    // afgjort til jul), ikke som et forbehold. Spilfører-råd på planen.
    const efteraar = /efter[åa]r/i.test(spilNavn);
    return {
      navn: 'Premier League',
      // OBS (QC): når forårsspillet oprettes, er 'blanke tavler' forkert for
      // en fortsættelse — giv foråret sin egen overskrift dér, ikke her.
      overskrift: 'Ny liga, blanke tavler',
      periode: efteraar ? 'hele efter&aring;ret' : 'hele s&aelig;sonen',
      chip3: efteraar ? '&#128197; 18 runder &mdash; afgjort til jul' : '&#127942; Kun &aelig;re p&aring; spil',
      harPulje,
      poolSize,
      // Ægte PL-screenshot (ejerens, runde 1 med Arsenal-Coventry) —
      // committet i public/salgstale/, ellers måtte stien ikke stå her.
      rundeImg: 'salgstale/runde-pl.png',
      puljeImg: null,
    };
  }
  if (game && game?.sync?.provider !== 'superliga') {
    // Ukendt/fremtidig liga: neutral profil uden SL-påstande og uden billeder.
    return {
      // RÅT navn — invitationsHtml escaper ved indsættelsen. Escapede vi
      // her, ville næste gren, nogen glemmer, være en injektion med grøn
      // suite (Security-designnote: escap dér hvor der flettes).
      navn: (typeof game.shortName === 'string' && game.shortName.slice(0, 60)) || spilNavn || 'ligaen',
      overskrift: 'Klar til kamp?',
      periode: 'hele s&aelig;sonen',
      chip3: '&#127942; Kun &aelig;re p&aring; spil',
      harPulje,
      poolSize,
      rundeImg: null,
      puljeImg: null,
    };
  }
  return {
    navn: 'Superligaen',
    overskrift: 'Klar til revanche?',
    periode: 'hele s&aelig;sonen',
    chip3: '&#127942; Kun &aelig;re p&aring; spil',
    harPulje: game ? harPulje : true,
    poolSize,
    rundeImg: 'salgstale/runde.png',
    puljeImg: 'salgstale/pulje.png',
  };
}

/**
 * Byg hele invitationen for et spil.
 * @param {object} opts
 * @param {object} [opts.liga]     Profil fra ligaProfil() — udeladt = Superligaen
 * @param {string} opts.intro      Admins egen tekst (ren tekst; escapes — typisk med tilbageblik/top 5)
 * @param {string} opts.joinLink   Ligaens /tilmeld-link (knappen i den gule blok)
 * @param {string} [opts.leagueName]  Ligaens navn (nævnes i den gule blok)
 * @param {string} [opts.appUrl]   Basis-URL (default tip.vejleaa.dk) — også til skærmbillederne
 * @returns {string} komplet HTML-dokument til e-mail
 */
function invitationsHtml({ liga, intro, joinLink, leagueName, appUrl = 'https://tip.vejleaa.dk' } = {}) {
  const l = liga || ligaProfil(null);
  const cta = joinLink || appUrl;
  const league = leagueName ? esc(leagueName) : 'vores liga';
  const introHtml = esc(intro || '').replace(/\r\n|\r|\n/g, '<br>');

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(l.navn)} skal tippes</title></head>
<body style="margin:0;padding:0;background:#f4f7f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f7f5" style="background:#f4f7f5;">
<tr><td align="center" style="padding:0 10px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

  <tr><td bgcolor="#0b6e4f" style="background:#0b6e4f;padding:34px 30px 30px 30px;">
    <div style="font-family:${FONT};font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#f7d417;">&#9917; ${esc(l.navn)} skal tippes &middot; ${l.periode}</div>
    <div style="font-family:${FONT};font-size:30px;line-height:34px;font-weight:bold;color:#ffffff;padding:10px 0 8px 0;">${l.overskrift}</div>
    <div style="font-family:${FONT};font-size:16px;line-height:23px;color:#eaf5ef;">Runde for runde tipper du 1, X eller 2. Point f&oslash;lger oddsene, bonusserne bel&oslash;nner de modige, og mini-ligaen med vennerne holder gryden i kog hele s&aelig;sonen. Alle starter p&aring; nul, og det kr&aelig;ver nul fodboldforstand.</div>
    <div style="font-family:${FONT};font-size:13px;font-weight:bold;color:#0b3f2c;padding:16px 0 0 0;">
      <span style="background:#ffffff;padding:6px 12px;border-radius:20px;">&#9201; ~2 min pr. runde</span>&nbsp;
      <span style="background:#ffffff;padding:6px 12px;border-radius:20px;">&#129504; Ren mavefornemmelse</span>&nbsp;
      <span style="background:#f7d417;padding:6px 12px;border-radius:20px;">${l.chip3}</span>
    </div>
  </td></tr>

  ${introHtml ? `<tr><td style="padding:22px 4px 4px 4px;font-family:${FONT};font-size:16px;line-height:23px;color:#22302a;">${introHtml}</td></tr>
  <tr><td style="height:16px;line-height:16px;font-size:0;">&nbsp;</td></tr>` : ''}

  ${card({
    kicker: '&#9917; Spillets hjerte',
    title: 'Tip rundens kampe &mdash; 1, X eller 2',
    body: 'Hver runde sætter du hjemmesejr, uafgjort eller udesejr p&aring; kampene. Du f&aring;r <b>point svarende til oddsene</b>: rammer du storfavoritten, giver det lidt &mdash; rammer du overraskelsen, giver det stort. Du kan rette frit, indtil den enkelte kamp starter, og du kan bladre frem og tilbage mellem alle sæsonens runder.',
    img: l.rundeImg ? `${appUrl}/${l.rundeImg}` : null,
    imgAlt: 'Tip-fladen: rundens kampe med 1X2-knapper',
  })}

  ${card({
    kicker: '&#127919; Flere veje til point',
    title: l.harPulje ? 'Combi-bonus, Chancen og s&aelig;sonens pulje' : 'Combi-bonus, Chancen og liga-sp&oslash;rgsm&aring;l',
    rows: [
      featureRow({ n: 1, title: 'Combi-bonus &#127920;', text: 'Oddsene p&aring; de kampe, du rammer, ganges sammen, og du f&aring;r 2 &times; kvadratroden af produktet i bonus &mdash; h&oslash;jst 25 point. Det t&aelig;ller fra to rigtige og opefter, og en glemt kamp koster dig ikke bonussen.' }),
      featureRow({ n: 2, title: 'Chancen &#9889;', text: 'N&aring;r du er HELT sikker: s&aelig;t point p&aring; spil p&aring; &eacute;t af rundens tips. Rammer du, ganges indsatsen med oddsene &mdash; ellers mister du kun indsatsen. Du kan aldrig g&aring; i minus.' }),
      l.harPulje
        ? featureRow({ n: 3, title: 'Pulje-tippet &#127942;', text: `S&aelig;sonens store bonuspot: udpeg de <b>${l.poolSize} hold</b>, du tror ender i mesterskabsspillet. <b>+4 point</b> pr. rigtigt hold og <b>+10 bonus</b> for alle ${l.poolSize} &mdash; afgjort til allersidst, s&aring; det kan vende hele stillingen.`, last: true })
        : featureRow({ n: 3, title: 'Liga-sp&oslash;rgsm&aring;l &#127942;', text: 'Ligaens egen joker: liga-admin stiller sp&oslash;rgsm&aring;l (&quot;hvem bliver topscorer?&quot;), I svarer f&oslash;r deadline &mdash; og pointene falder, n&aring;r facit kendes, s&aring; de kan vende stillingen sent.', last: true }),
    ].join(''),
    img: l.harPulje && l.puljeImg ? `${appUrl}/${l.puljeImg}` : null,
    imgAlt: 'Pulje-tippet: v&aelig;lg mesterskabsholdene',
    imgWidth: 340,
  })}

  ${card({
    kicker: '&#128101; Og s&aring; er der de andre',
    title: 'Din liga, ranglisten og Runde-Botten',
    rows: [
      featureRow({ n: 1, title: 'Jeres egen mini-liga', text: l.harPulje
        ? 'Intern stilling, en liga-v&aelig;g til drillerier &mdash; og liga-sp&oslash;rgsm&aring;l, som liga-admin selv finder p&aring; (&quot;hvem bliver topscorer?&quot;) og giver point for.'
        : 'Intern stilling og en liga-v&aelig;g til drillerier &mdash; s&aelig;sonen igennem.' }),
      featureRow({ n: 2, title: 'Runde-Botten &#129302;', text: 'Efter rundens sidste kamp skriver botten et resum&eacute; p&aring; jeres v&aelig;g &mdash; med k&aelig;rlige stikpiller til rundens bedste og v&aelig;rste.' }),
      featureRow({ n: 3, title: 'Facit, rangliste og statistik', text: 'Efter hver runde ser du dit facit, hvem du overhalede, din tr&aelig;fprocent under &quot;Mine tips&quot;, den officielle tabel og holdenes Elo-udvikling.', last: true }),
    ].join(''),
  })}

  <tr><td bgcolor="#f7d417" style="background:#f7d417;padding:28px 26px;text-align:center;">
    <div style="font-family:${FONT};font-size:22px;font-weight:bold;color:#12211b;">&Eacute;t klik &mdash; s&aring; er du med &#9917;</div>
    <div style="font-family:${FONT};font-size:15px;line-height:22px;color:#3a3200;font-weight:bold;padding:8px 0 18px 0;">Knappen opretter dig, godkender dig og melder dig ind i <b>${league}</b> automatisk. Intet at taste, ingen ventetid.</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
      <td bgcolor="#0b6e4f" style="background:#0b6e4f;border-radius:10px;">
        <a href="${esc(cta)}" style="font-family:${FONT};display:inline-block;padding:14px 30px;color:#ffffff;font-size:17px;font-weight:bold;text-decoration:none;">V&aelig;r med nu &rarr;</a>
      </td>
    </tr></table>
    <div style="font-family:${FONT};font-size:12px;color:#5a4b00;padding:12px 0 0 0;word-break:break-all;">Virker knappen ikke? Kopi&eacute;r linket: ${esc(cta)}</div>
  </td></tr>

  <tr><td style="padding:22px 10px 30px 10px;text-align:center;font-family:${FONT};font-size:13px;color:#5b6b63;">
    Vind eller tab &mdash; men <b style="color:#0b6e4f;">v&aelig;r med</b>. Vi ses p&aring; ranglisten. &#9917;<br>
    <span style="font-size:12px;color:#8a958f;">Sendt fra Vejleaa Tip &middot; <a href="${appUrl}" style="color:#0b6e4f;">${appUrl.replace('https://', '')}</a></span>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

module.exports = { invitationsHtml, ligaProfil, invitationsFejl };
