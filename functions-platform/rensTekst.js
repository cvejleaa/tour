/**
 * rensTekst — værn mod prompt-injection via brugerskreven tekst, før den
 * lægges i AI-fakta. Fjerner kontroltegn og kontekst-brydende tegn, klipper
 * længde. Generaliseret fra gameRecap.js's sanitizeName (samme adfærd for
 * navne: max 40, fallback 'Spiller'), fordi liga-spørgsmålenes afsløring også
 * skal rense SVAR og SPØRGSMÅLSTEKST — flere frie tekstfelter, samme værn,
 * ét sted (én vagt pr. sikkerhedsregel).
 */
function rensTekst(s, { max = 40, fallback = 'Spiller' } = {}) {
  // Fjendtligt indhold ({toString: null}) får String() til at kaste — det må
  // aldrig kunne vælte et opslag (Security-fund). Ikke-konverterbart = fallback.
  let raa;
  try { raa = String(s == null ? '' : s); } catch { return fallback; }
  const t = raa
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/[<>{}[\]`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const cut = t.slice(0, max).trim();
  return cut || fallback;
}

module.exports = { rensTekst };
