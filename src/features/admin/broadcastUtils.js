/**
 * Hjælpere til "Send mail"-fanen. Rene funktioner — nemme at teste.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Parser en fritekst-liste af modtagere (adskilt af komma, semikolon, mellemrum
 * eller linjeskift) til gyldige/ugyldige adresser. Dedupliker uafhængigt af
 * store/små bogstaver, og bevarer rækkefølgen.
 * @param {string} text
 * @returns {{ valid: string[], invalid: string[] }}
 */
export function parseRecipients(text) {
  const parts = String(text || '').split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const seen = new Set();
  const valid = [];
  const invalid = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (EMAIL_RE.test(p)) valid.push(p); else invalid.push(p);
  }
  return { valid, invalid };
}
