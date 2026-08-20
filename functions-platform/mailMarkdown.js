// ---------------------------------------------------------------------------
// mailMarkdown — render af en broadcast-brødtekst (Send mail) til e-mail-HTML.
//
// SPEJLET: functions-platform/mailMarkdown.js SKAL være identisk (kun
// export-linjen adskiller sig). Klienten bruger den til LIVE forhåndsvisning,
// serveren til den FAKTISKE udsendelse — samme funktion begge steder, så
// preview aldrig kan love noget, modtageren ikke får. Paritetstesten i
// functions-platform/mailMarkdown.test.js holder de to filer i trit.
//
// GENERATE-SAFE, IKKE FILTER-UNSAFE. Vi renser ALDRIG en streng af rå HTML
// (dér gemmer injektioner sig — repoet har allerede to PoC'er på escape-bypass).
// I stedet: parse teksten til KENDTE node-typer og SERIALISÉR hver node med
// escaped indhold. En node, vi ikke kender, findes ikke i outputtet. Derfor
// kan der aldrig stå <script>, on*=, javascript: eller data: i resultatet —
// ikke fordi vi fjerner det, men fordi vi kun nogensinde SKRIVER kendte tags.
//
// BEVARER DAGENS OPFØRSEL (broadcastHtml gjorde dette før): enkelt \n → <br>,
// og bare URL'er bliver klikbare. Uden det ville hver eksisterende mail
// (regelbrevet, salgstalen, "Indsæt top 5"-blokken) skifte udseende.
//
// BEVIDST UDELADT: ordnede lister (`1.`). "Indsæt top 5" skriver linjer som
// `4. David – 25 point`; en <ol> ville tælle dem om til 1., 2., … Kun `- `
// giver punktliste. Kodeblokke/tabeller/citater er også ude — uden for ejerens
// ønske, og hvert ekstra konstrukt er en ekstra flade at holde sikker.
//
// KUN https-billeder. Mail-klienter blokerer http/data:-billeder, og Gmails
// billed-proxy henter kun https. Et http/relativt/data: billede ville stå
// knækket hos modtageren — så en img-URL, der ikke er https, renderes IKKE som
// billede (den rå tekst vises i stedet, så fejlen er synlig, ikke tavs).
// ---------------------------------------------------------------------------

const A_STYLE = 'color:#1a7f37';
const IMG_STYLE = 'max-width:100%;height:auto;border-radius:6px';
const HR_STYLE = 'border:none;border-top:1px solid #eee;margin:18px 0';
const UL_STYLE = 'margin:0.4em 0;padding-left:1.4em';
const H_STYLE = {
  1: 'font-size:22px;margin:0.6em 0 0.3em',
  2: 'font-size:18px;margin:0.6em 0 0.3em',
  3: 'font-size:16px;margin:0.6em 0 0.3em',
};

/** Undslip HTML — ALT brugerindtastet tekst går igennem den før den skrives. */
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function imgTag(alt, url) {
  return `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" style="${IMG_STYLE}">`;
}
function linkTag(label, url) {
  return `<a href="${escapeHtml(url)}" style="${A_STYLE}">${escapeHtml(label)}</a>`;
}

// Inline-konstrukter, prøvet i denne rækkefølge; ved samme startposition
// vinder den FØRSTE i listen (billede før link, fed før kursiv, alt før bar
// URL). Hver skal forbruge mindst ét tegn, så inline() altid terminerer.
const INLINE = [
  { type: 'img', re: /!\[([^\]]*)\]\((https:\/\/[^\s)]+)\)/ },
  { type: 'link', re: /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/ },
  { type: 'bold', re: /\*\*([^*]+)\*\*/ },
  { type: 'em', re: /\*([^*]+)\*/ },
  { type: 'url', re: /(https?:\/\/[^\s<]+)/ },
];

/** Render inline-formatering i én tekstlinje/liste-punkt/overskrift. */
function inline(text) {
  let out = '';
  let rest = String(text == null ? '' : text);
  while (rest.length) {
    let best = null;
    for (const p of INLINE) {
      const m = p.re.exec(rest);
      if (m && (best === null || m.index < best.m.index)) best = { p, m };
    }
    if (!best) { out += escapeHtml(rest); break; }
    const { p, m } = best;
    out += escapeHtml(rest.slice(0, m.index)); // teksten FØR tokenet: altid escaped
    if (p.type === 'img') out += imgTag(m[1], m[2]);
    else if (p.type === 'link') out += linkTag(m[1], m[2]);
    else if (p.type === 'bold') out += `<strong>${escapeHtml(m[1])}</strong>`;
    else if (p.type === 'em') out += `<em>${escapeHtml(m[1])}</em>`;
    else if (p.type === 'url') out += linkTag(m[1], m[1]);
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

/**
 * body (ren tekst med let Markdown) → saniteret HTML-FRAGMENT (uden layout).
 * Kalderen (broadcastHtml / preview-ruden) pakker fragmentet i mail-layoutet.
 * @param {string} body
 * @returns {string}
 */
function mailMarkdown(body) {
  const lines = String(body == null ? '' : body).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let textRun = [];
  let listItems = [];
  const flushText = () => {
    if (textRun.length) { out.push(textRun.join('<br>')); textRun = []; }
  };
  const flushList = () => {
    if (listItems.length) {
      out.push(`<ul style="${UL_STYLE}">${listItems.map((x) => `<li>${x}</li>`).join('')}</ul>`);
      listItems = [];
    }
  };
  for (const line of lines) {
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    const bullet = /^-\s+(.+)$/.exec(line);
    const hr = /^-{3,}$/.test(line.trim());
    if (h) {
      flushText(); flushList();
      const lvl = h[1].length;
      out.push(`<h${lvl} style="${H_STYLE[lvl]}">${inline(h[2])}</h${lvl}>`);
    } else if (hr) {
      flushText(); flushList();
      out.push(`<hr style="${HR_STYLE}">`);
    } else if (bullet) {
      // En liste afbryder et tekst-løb, men samler flere `- `-linjer i ét <ul>.
      flushText();
      listItems.push(inline(bullet[1]));
    } else {
      flushList();
      textRun.push(inline(line));
    }
  }
  flushText(); flushList();
  return out.join('');
}

module.exports = { mailMarkdown };
