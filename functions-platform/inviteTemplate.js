'use strict';
// ---------------------------------------------------------------------------
// inviteTemplate.js — HTML-skabelon for Superliga-invitationen (Send mail).
// Spejler Tour-salgstalens design: grøn hero, hvide kort, skærmbillede fra
// sitet (public/salgstale/pulje.png) og en gul tilmeldingsblok med ligaens
// ét-kliks-link. Admins egen tekst (inkl. tilbageblik/top 5) står øverst.
// Ren funktion — testbar uden Firebase.
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

/**
 * Byg hele Superliga-invitationen.
 * @param {object} opts
 * @param {string} opts.intro      Admins egen tekst (ren tekst; escapes — typisk med tilbageblik/top 5)
 * @param {string} opts.joinLink   Ligaens /tilmeld-link (knappen i den gule blok)
 * @param {string} [opts.leagueName]  Ligaens navn (nævnes i den gule blok)
 * @param {string} [opts.appUrl]   Basis-URL (default tip.vejleaa.dk) — også til skærmbilledet
 * @returns {string} komplet HTML-dokument til e-mail
 */
function superligaInviteHtml({ intro, joinLink, leagueName, appUrl = 'https://tip.vejleaa.dk' } = {}) {
  const cta = joinLink || appUrl;
  const league = leagueName ? esc(leagueName) : 'vores liga';
  const introHtml = esc(intro || '').replace(/\r\n|\r|\n/g, '<br>');

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Superligaen skal tippes</title></head>
<body style="margin:0;padding:0;background:#f4f7f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f7f5" style="background:#f4f7f5;">
<tr><td align="center" style="padding:0 10px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

  <tr><td bgcolor="#0b6e4f" style="background:#0b6e4f;padding:34px 30px 30px 30px;">
    <div style="font-family:${FONT};font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#f7d417;">&#9917; Superligaen skal tippes &middot; hele s&aelig;sonen</div>
    <div style="font-family:${FONT};font-size:30px;line-height:34px;font-weight:bold;color:#ffffff;padding:10px 0 8px 0;">Klar til revanche?</div>
    <div style="font-family:${FONT};font-size:16px;line-height:23px;color:#eaf5ef;">Tip 1, X eller 2 p&aring; rundens kampe, jagt combi-bonussen &mdash; og s&aelig;t sæsonens store pulje-tip. Alle starter p&aring; nul, og det kr&aelig;ver nul fodboldforstand.</div>
    <div style="font-family:${FONT};font-size:13px;font-weight:bold;color:#0b3f2c;padding:16px 0 0 0;">
      <span style="background:#ffffff;padding:6px 12px;border-radius:20px;">&#9201; ~2 min pr. runde</span>&nbsp;
      <span style="background:#ffffff;padding:6px 12px;border-radius:20px;">&#129504; Ren mavefornemmelse</span>&nbsp;
      <span style="background:#f7d417;padding:6px 12px;border-radius:20px;">&#127942; Kun &aelig;re p&aring; spil</span>
    </div>
  </td></tr>

  ${introHtml ? `<tr><td style="padding:22px 4px 4px 4px;font-family:${FONT};font-size:16px;line-height:23px;color:#22302a;">${introHtml}</td></tr>
  <tr><td style="height:16px;line-height:16px;font-size:0;">&nbsp;</td></tr>` : ''}

  <tr><td style="padding:0 0 22px 0;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:600px;background:#ffffff;border:1px solid #e3ece8;">
      <tr><td style="padding:22px 26px 4px 26px;font-family:${FONT};">
        <div style="font-family:${FONT};font-size:12px;font-weight:bold;color:#0b6e4f;letter-spacing:1px;text-transform:uppercase;">&#127942; S&aelig;sonens store bonuspot</div>
        <div style="font-family:${FONT};font-size:22px;font-weight:bold;color:#12211b;padding:6px 0 4px 0;">Pulje-tippet &mdash; s&aelig;t det F&Oslash;R det l&aring;ser</div>
        <div style="font-family:${FONT};font-size:15px;line-height:22px;color:#28362f;padding:0 0 14px 0;">Udpeg de <b>6 hold</b> du tror ender i mesterskabsspillet: <b>+4 point</b> pr. rigtigt hold og <b>+10 bonus</b> for alle 6. Det afg&oslash;res f&oslash;rst til aller sidst &mdash; og kan vende HELE stillingen. Du finder det under fanen <b>&quot;Puljen&quot;</b>.</div>
      </td></tr>
      <tr><td style="padding:0;border-top:1px solid #e3ece8;" bgcolor="#fbfdfc" align="center">
        <img src="${appUrl}/salgstale/pulje.png" alt="Pulje-tippet: v&aelig;lg de 6 mesterskabshold" width="430" style="width:430px;max-width:100%;display:block;border:0;margin:0 auto;" />
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:0 0 22px 0;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:600px;background:#ffffff;border:1px solid #e3ece8;">
      <tr><td style="padding:22px 26px 18px 26px;font-family:${FONT};">
        <div style="font-family:${FONT};font-size:12px;font-weight:bold;color:#0b6e4f;letter-spacing:1px;text-transform:uppercase;">&#9917; S&aring;dan spiller du</div>
        <div style="font-family:${FONT};font-size:22px;font-weight:bold;color:#12211b;padding:6px 0 4px 0;">Runde for runde &mdash; med bonus til de modige</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          ${featureRow({ n: 1, title: 'Tip 1X2 p&aring; rundens kampe', text: 'Point f&oslash;lger oddsene &mdash; jo st&oslash;rre overraskelse du rammer, jo flere point. Hver kamp l&aring;ser ved sin egen kampstart.' })}
          ${featureRow({ n: 2, title: 'Combi-bonus &amp; Chancen &#9889;', text: 'Ram hele runden (eller alle p&aring; n&aelig;r &eacute;n) og f&aring; oddsene ganget sammen som bonus. Og n&aring;r du er HELT sikker: s&aelig;t point p&aring; spil med Chancen.' })}
          ${featureRow({ n: 3, title: 'Liga-v&aelig;g + Runde-Botten &#129302;', text: 'Jeres eget rum med intern stilling, liga-sp&oslash;rgsm&aring;l og en bot, der efter hver runde uddeler k&aelig;rlige stikpiller til rundens bedste (og v&aelig;rste).', last: true })}
        </table>
      </td></tr>
    </table>
  </td></tr>

  <tr><td bgcolor="#f7d417" style="background:#f7d417;padding:28px 26px;text-align:center;">
    <div style="font-family:${FONT};font-size:22px;font-weight:bold;color:#12211b;">&Eacute;t klik &mdash; s&aring; er du med &#9917;</div>
    <div style="font-family:${FONT};font-size:15px;line-height:22px;color:#3a3200;font-weight:bold;padding:8px 0 18px 0;">Knappen opretter dig, godkender dig og melder dig ind i <b>${league}</b> automatisk. Intet at taste, ingen ventetid.</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
      <td bgcolor="#0b6e4f" style="background:#0b6e4f;border-radius:10px;">
        <a href="${cta}" style="font-family:${FONT};display:inline-block;padding:14px 30px;color:#ffffff;font-size:17px;font-weight:bold;text-decoration:none;">V&aelig;r med nu &rarr;</a>
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

module.exports = { superligaInviteHtml };
