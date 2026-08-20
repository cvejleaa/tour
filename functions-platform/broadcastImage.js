// ---------------------------------------------------------------------------
// broadcastImage.js — REN vagt for billed-upload i Send mail (mønster fra
// invitationsFejl: én ren, mutationstestet funktion, ingen Firebase).
//
// Upload går gennem en callable (requireAdmin), fordi Storage-regler IKKE kan
// læse Firestore-roller — så adgangsbeslutningen bor server-side, ikke i en
// Storage-regel. Denne fil er den vagt, callablen kalder.
// ---------------------------------------------------------------------------

// Kun rasterformater, som mail-klienter viser. SVG er BEVIDST udeladt: en SVG
// er en scriptbar dokumenttype (kan bære <script>/onload), og selv om den
// serveres fra vores bucket, ville et sådant billede være en XSS-vej, hvis en
// modtager åbnede det direkte. Mail viser alligevel ikke SVG pålideligt.
const TILLADTE = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

// 1,5 MB. Mail-billeder skal være små: store billeder gør mailen tung, rammer
// indbakke-lofter, og Gmails proxy afviser meget store. callable-payloaden
// (base64) er ~⅓ større end filen, godt under callable-loftet på ~10 MB.
const MAKS_BYTES = 1_500_000;

const TILLADTE_EXT = new Set(Object.values(TILLADTE));

/**
 * Valider et uploadet billede. Returnerer {ok:true, ext} eller {ok:false, error}
 * med en DANSK fejl, admin kan læse i fladen (ikke en rå SDK-fejl).
 * @param {{contentType:string, bytes:number}} o
 */
function validerBroadcastBillede({ contentType, bytes } = {}) {
  const ext = TILLADTE[String(contentType || '').toLowerCase()];
  if (!ext) return { ok: false, error: 'Kun PNG, JPG, GIF eller WEBP kan uploades.' };
  if (!Number.isFinite(bytes) || bytes <= 0) return { ok: false, error: 'Billedet er tomt.' };
  if (bytes > MAKS_BYTES) {
    return { ok: false, error: `Billedet er for stort (${Math.round(bytes / 1000)} KB) — maks ${Math.round(MAKS_BYTES / 1000)} KB.` };
  }
  return { ok: true, ext };
}

/**
 * Storage-sti med UNIKT navn pr. upload. Gmails billed-proxy cacher pr. URL,
 * så to forskellige billeder må ALDRIG dele URL — ellers viser en ny mail et
 * gammelt billede (spilfører-fund). `unik` leveres af kalderen (tidsstempel +
 * tilfældig streng) og saniteres her, så intet kan bryde ud af `broadcast/`.
 * @param {string} ext  filendelse fra validerBroadcastBillede
 * @param {string} unik
 * @returns {string|null}
 */
function broadcastBilledeSti(ext, unik) {
  if (!TILLADTE_EXT.has(ext)) return null; // kun en valideret ext
  const rent = String(unik == null ? '' : unik).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!rent) return null; // tomt/kun-ugyldige tegn → ingen sti (fejl-lukket)
  return `broadcast/${rent}.${ext}`;
}

module.exports = { validerBroadcastBillede, broadcastBilledeSti, MAKS_BYTES, TILLADTE };
