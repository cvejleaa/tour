'use strict';
// ---------------------------------------------------------------------------
// salesPitch.js — HTML-skabelon for "sidste chance"-salgstalen (Send mail).
//
// Genbruger designet fra den oprindelige salgstale: grøn hero, hvide kort med
// skærmbilleder og den GULE tilmeldingsblok nederst. Skærmbillederne hostes på
// sitet (public/salgstale/*.png) i stedet for at være indlejret som base64 —
// ellers klipper Gmail mailen (grænse ~100 KB). Knappen i den gule blok peger
// på ligaens DIREKTE tilmeldingslink (/tilmeld?kode=…), så modtageren oprettes,
// godkendes og tilmeldes ligaen med ét klik.
//
// Ren og testbar: ingen Firebase-afhængigheder.
// ---------------------------------------------------------------------------

const FONT = 'Segoe UI,Arial,Helvetica,sans-serif';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Én nummereret række (grøn cirkel + titel + tekst) — samme sprog som den
 *  oprindelige salgstales bonus-blok. */
function featureRow({ n, title, text, last }) {
  return `
    <tr><td style="padding:14px 0;${last ? '' : 'border-bottom:1px solid #eef3f0;'}">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
        <td width="34" valign="top" style="width:34px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="26" height="26" bgcolor="#0b6e4f" align="center" valign="middle" style="width:26px;height:26px;background:#0b6e4f;border-radius:13px;font-family:${FONT};color:#ffffff;font-size:13px;font-weight:bold;">${n}</td>
          </tr></table>
        </td>
        <td valign="top" style="font-family:${FONT};">
          <div style="font-family:${FONT};font-size:15px;line-height:21px;font-weight:bold;color:#12211b;">${title}</div>
          <div style="font-family:${FONT};font-size:14px;line-height:20px;color:#28362f;padding-top:3px;">${text}</div>
        </td>
      </tr></table>
    </td></tr>`;
}

/** Et hvidt kort med overskrift, tekst og et skærmbillede. */
function screenshotCard({ kicker, title, text, img, alt }) {
  return `
  <tr><td style="padding:0 0 22px 0;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:600px;background:#ffffff;border:1px solid #e3ece8;">
      <tr><td style="padding:22px 26px 4px 26px;font-family:${FONT};">
        <div style="font-family:${FONT};font-size:12px;font-weight:bold;color:#0b6e4f;letter-spacing:1px;text-transform:uppercase;">${kicker}</div>
        <div style="font-family:${FONT};font-size:22px;font-weight:bold;color:#12211b;padding:6px 0 4px 0;">${title}</div>
        <div style="font-family:${FONT};font-size:15px;line-height:22px;color:#28362f;padding:0 0 14px 0;">${text}</div>
      </td></tr>
      <tr><td style="padding:0;border-top:1px solid #e3ece8;" bgcolor="#fbfdfc">
        <img src="${img}" alt="${alt}" width="600" style="width:600px;max-width:600px;display:block;border:0;" />
      </td></tr>
    </table>
  </td></tr>`;
}

/**
 * Byg hele salgstale-mailen.
 * @param {object} opts
 * @param {string} opts.intro      Admins personlige intro-tekst (ren tekst; escapes)
 * @param {string} opts.joinLink   Ligaens /tilmeld-link (knappen i den gule blok)
 * @param {string} [opts.leagueName]  Ligaens navn (nævnes i den gule blok)
 * @param {string} [opts.appUrl]   Basis-URL (default tour.vejleaa.dk) — også til billederne
 * @returns {string} komplet HTML-dokument til e-mail
 */
function salesPitchHtml({ intro, joinLink, leagueName, appUrl = 'https://tour.vejleaa.dk' } = {}) {
  const cta = joinLink || appUrl;
  const league = leagueName ? esc(leagueName) : 'vores liga';
  const introHtml = esc(intro || '').replace(/\r\n|\r|\n/g, '<br>');

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tour de France Tip 2026</title></head>
<body style="margin:0;padding:0;background:#f4f7f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f7f5" style="background:#f4f7f5;">
<tr><td align="center" style="padding:0 10px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

  <tr><td bgcolor="#0b6e4f" style="background:#0b6e4f;padding:34px 30px 30px 30px;">
    <div style="font-family:${FONT};font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#f7d417;">&#128680; Sidste chance &middot; Touren ruller I DAG kl. 17.05</div>
    <div style="font-family:${FONT};font-size:30px;line-height:34px;font-weight:bold;color:#ffffff;padding:10px 0 8px 0;">Er du med, n&aring;r starten g&aring;r?</div>
    <div style="font-family:${FONT};font-size:16px;line-height:23px;color:#eaf5ef;">Tre ugers f&aelig;lles sommerdrilleri begynder i aften i Barcelona. Tip cykelhold hver dag, saml point, og f&oslash;lg stillingen hele vejen til Paris &mdash; du beh&oslash;ver ikke vide en dyt om cykling.</div>
    <div style="font-family:${FONT};font-size:13px;font-weight:bold;color:#0b3f2c;padding:16px 0 0 0;">
      <span style="background:#ffffff;padding:6px 12px;border-radius:20px;">&#9201; ~2 min om dagen</span>&nbsp;
      <span style="background:#ffffff;padding:6px 12px;border-radius:20px;">&#129504; Ingen foruds&aelig;tninger</span>&nbsp;
      <span style="background:#f7d417;padding:6px 12px;border-radius:20px;">&#127942; Kun &aelig;re p&aring; spil</span>
    </div>
  </td></tr>

  ${introHtml ? `<tr><td style="padding:22px 4px 4px 4px;font-family:${FONT};font-size:16px;line-height:23px;color:#22302a;">${introHtml}</td></tr>
  <tr><td style="height:16px;line-height:16px;font-size:0;">&nbsp;</td></tr>` : ''}

  ${screenshotCard({
    kicker: '&#128692; S&aring;dan tipper du',
    title: 'Tip hold &mdash; ikke navne du aldrig har h&oslash;rt om',
    text: 'V&aelig;lg hold p&aring; hver etape lige indtil starten g&aring;r. Har du travlt? &Eacute;n knap s&aelig;tter dit g&aelig;t p&aring; <i>alle</i> &aring;bne etaper p&aring; sekunder.',
    img: `${appUrl}/salgstale/etaper.png`,
    alt: 'Etape-siden',
  })}

  ${screenshotCard({
    kicker: '&#127758; Kend holdene',
    title: 'Verdensrangliste og stjerner',
    text: 'P&aring; hvert hold ser du profilen, favoritterne og hele startlisten med rytternes plads p&aring; verdensranglisten. Selv uden cykelviden kan du g&aelig;tte som en ekspert.',
    img: `${appUrl}/salgstale/hold.png`,
    alt: 'Holdside med verdensrangliste',
  })}

  ${screenshotCard({
    kicker: '&#128202; Overblik',
    title: 'De 23 hold &mdash; &eacute;t klik v&aelig;k',
    text: 'Sort&eacute;r efter navn, holdets verdensrang eller styrken af hele startlisten. Alt du skal bruge for at l&aelig;gge en plan.',
    img: `${appUrl}/salgstale/holdoversigt.png`,
    alt: 'Oversigt over de 23 hold',
  })}

  <tr><td style="padding:0 0 22px 0;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:600px;background:#ffffff;border:1px solid #e3ece8;">
      <tr><td style="padding:22px 26px 8px 26px;font-family:${FONT};">
        <div style="font-family:${FONT};font-size:12px;font-weight:bold;color:#0b6e4f;letter-spacing:1px;text-transform:uppercase;">&#127942; ${league.charAt(0).toUpperCase() + league.slice(1)}</div>
        <div style="font-family:${FONT};font-size:22px;font-weight:bold;color:#12211b;padding:6px 0 4px 0;">Det hele sker p&aring; liga-siden</div>
        <div style="font-family:${FONT};font-size:15px;line-height:22px;color:#28362f;padding:0 0 6px 0;">Det er her de tre uger bliver SJOVE &mdash; jeres helt eget rum:</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          ${featureRow({ n: 1, title: 'Daglig stilling &mdash; kun mod hinanden', text: 'Se hvem der f&oslash;rer, hvem der haler ind, og hvem der f&aring;r pil ned. Opdateres automatisk hver aften, n&aring;r etapen er afgjort.' })}
          ${featureRow({ n: 2, title: 'Liga-v&aelig;ggen + Tour-Botten &#129302;', text: 'Kommentarer, emoji-reaktioner og private beskeder &mdash; og hver morgen skriver Tour-Botten et opslag om nattens drama med k&aelig;rlige stikpiller til dagens taber.' })}
          ${featureRow({ n: 3, title: 'Egne bonussp&oslash;rgsm&aring;l og "hvem har tippet?"', text: 'Ligaen kan stille sine egne sp&oslash;rgsm&aring;l, og I kan se hvem der mangler at tippe dagens etape &mdash; perfekt til at prikke til de sl&oslash;ve.', last: true })}
        </table>
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:0 0 22px 0;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef6f1" style="width:600px;background:#eef6f1;border:1px solid #d9e8df;">
      <tr><td style="padding:18px 26px;font-family:${FONT};font-size:14px;line-height:21px;color:#22302a;">
        <b>Godt at vide, n&aring;r du er inde:</b><br>
        &#10067; <b>Hj&aelig;lpesiden</b> forklarer alt p&aring; to minutter &mdash; tips, point, bonus og ligaer: <a href="${appUrl}/hjaelp" style="color:#0b6e4f;font-weight:bold;">${appUrl.replace('https://', '')}/hjaelp</a><br>
        &#128578; <b>Din profil</b>: v&aelig;lg en emoji som profilbillede, s&aelig;t dit yndlingshold (farver hele appen!) og styr dine e-mail-p&aring;mindelser &mdash; du f&aring;r automatisk en venlig mail p&aring; etapedage, hvis du mangler at tippe (og kan sl&aring; den fra igen).
      </td></tr>
    </table>
  </td></tr>

  <tr><td bgcolor="#f7d417" style="background:#f7d417;padding:28px 26px;text-align:center;">
    <div style="font-family:${FONT};font-size:22px;font-weight:bold;color:#12211b;">D&oslash;ren smækker kl. 17.05 &#9200;</div>
    <div style="font-family:${FONT};font-size:15px;line-height:22px;color:#3a3200;font-weight:bold;padding:8px 0 18px 0;">&Eacute;t klik p&aring; knappen &mdash; s&aring; er du oprettet, godkendt og med i <b>${league}</b>. Intet at taste, ingen ventetid. I morgen er du enten med i snakken eller udenfor den.</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
      <td bgcolor="#0b6e4f" style="background:#0b6e4f;border-radius:10px;">
        <a href="${cta}" style="font-family:${FONT};display:inline-block;padding:14px 30px;color:#ffffff;font-size:17px;font-weight:bold;text-decoration:none;">V&aelig;r med nu &rarr;</a>
      </td>
    </tr></table>
    <div style="font-family:${FONT};font-size:12px;color:#5a4b00;padding:12px 0 0 0;word-break:break-all;">Virker knappen ikke? Kopi&eacute;r linket: ${esc(cta)}</div>
  </td></tr>

  <tr><td style="padding:22px 10px 30px 10px;text-align:center;font-family:${FONT};font-size:13px;color:#5b6b63;">
    Vind eller tab &mdash; men <b style="color:#0b6e4f;">v&aelig;r med</b>. Vi ses p&aring; ranglisten. &#128692;&#128168;
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

module.exports = { salesPitchHtml };
