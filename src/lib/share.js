/**
 * Del en tekst (fx rundens facit) — bruger den native del-dialog hvor den findes
 * (mobil/gruppechat), ellers kopieres teksten til udklipsholderen.
 * @returns {Promise<{ok:boolean, method:'share'|'copy'|'none', error?:string}>}
 */
export async function shareText(text) {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ text });
      return { ok: true, method: 'share' };
    } catch (err) {
      // Bruger annullerede del-dialogen → ikke en fejl.
      if (err && err.name === 'AbortError') return { ok: false, method: 'none' };
      // ellers falder vi tilbage til kopiering
    }
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return { ok: true, method: 'copy' };
    } catch (err) {
      return { ok: false, method: 'none', error: err?.message };
    }
  }
  return { ok: false, method: 'none' };
}
