// Engangs-værktøj (kun ejer): genskriv VM-Bottens gamle opslag med den korrekte
// logik og stillingen, som den var dengang. Kun teksten ændres — tidspunkterne
// (createdAt) røres ikke. Kører i små bidder (timer ikke ud), kan genoptages og
// nulstilles. Tør-kør viser eksempler uden at gemme.
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { callRegenerateRecaps } from './adminActions';

export default function RecapBackfillPanel() {
  const { isOwner } = useAuth();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [previews, setPreviews] = useState(null);

  if (!isOwner) return null;

  async function dryRun() {
    setBusy(true);
    setMsg('');
    setPreviews(null);
    const res = await callRegenerateRecaps({ apply: false });
    setBusy(false);
    if (!res.ok) { setMsg(`Fejl: ${res.error}`); return; }
    const d = res.data || {};
    setPreviews(d.previews || []);
    if ((d.previews?.length ?? 0) === 0 && d.lastError) {
      setMsg(`Fejl: AI'en svarede ikke (${d.lastError}). Det er typisk rate-limit eller opbrugt kredit — vent lidt og prøv igen, eller tjek Anthropic-kontoen.`);
    } else {
      setMsg(`Eksempler på ${d.previews?.length ?? 0} af i alt ${d.totalBot ?? 0} opslag. Ser det rigtigt ud, så tryk "Gem alle".`);
    }
  }

  async function saveAll() {
    if (!window.confirm('Genskriv og gem teksten på alle bottens opslag? Tidspunkterne røres ikke.')) return;
    setBusy(true);
    setPreviews(null);
    let total = 0;
    // Gemmer i bidder, indtil der ikke er flere tilbage (eller intet kan genskrives).
    for (;;) {
      setMsg(`Gemmer… (${total} gemt indtil nu)`);
      const res = await callRegenerateRecaps({ apply: true });
      if (!res.ok) { setMsg(`Fejl: ${res.error} (${total} nåede at blive gemt)`); setBusy(false); return; }
      const d = res.data || {};
      total += d.updated || 0;
      if ((d.updated || 0) === 0 || (d.remaining || 0) <= 0) {
        const left = d.remaining || 0;
        if (left > 0) {
          const why = d.lastError ? ` (AI-fejl: ${d.lastError})` : '';
          setMsg(`Stoppede ved ${total} opslag — ${left} mangler endnu${why}. Det er typisk rate-limit/kredit; vent lidt og tryk "Gem alle" igen.`);
        } else {
          setMsg(`Færdig ✅ ${total} opslag opdateret. Tidspunkterne er uændrede.`);
        }
        setBusy(false);
        return;
      }
    }
  }

  async function reset() {
    if (!window.confirm('Nulstil genskrivnings-markeringen på alle bottens opslag? (Teksten ændres ikke nu, men "Gem alle" vil derefter genskrive dem alle igen.)')) return;
    setBusy(true);
    setMsg('');
    setPreviews(null);
    const res = await callRegenerateRecaps({ reset: true });
    setBusy(false);
    if (!res.ok) { setMsg(`Fejl: ${res.error}`); return; }
    setMsg(`Nulstillet: ${res.data?.cleared ?? 0} opslag (af ${res.data?.totalBot ?? 0}). Tryk "Gem alle" for at genskrive forfra.`);
  }

  return (
    <div className="card" style={{ marginTop: '1rem', borderColor: 'var(--c-border)' }}>
      <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem' }}>🤖 Genskriv VM-Bottens gamle opslag</h3>
      <p style={{ margin: '0 0 0.6rem', fontSize: '0.82rem', color: 'var(--c-muted)' }}>
        Genskriver teksten på alle bottens opslag (alle ligaer) med stillingen, som den var, da opslaget blev lavet.
        Kun teksten ændres — tidspunkterne røres ikke. Kører i små bidder, så det ikke timer ud; allerede genskrevne
        springes over. Tør-kør gemmer intet.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button className="btn btn--ghost btn--sm" onClick={dryRun} disabled={busy}>
          {busy ? 'Kører…' : '🔎 Tør-kør (vis eksempler)'}
        </button>
        <button className="btn btn--sm" onClick={saveAll} disabled={busy}>
          💾 Gem alle
        </button>
        <button className="btn btn--ghost btn--sm" onClick={reset} disabled={busy}>
          ↺ Nulstil
        </button>
      </div>

      {msg && (
        <div role="alert" style={{
          marginTop: '0.6rem', padding: '0.5rem 0.8rem', borderRadius: 8, fontSize: '0.85rem',
          background: msg.startsWith('Fejl') ? '#fef2f2' : '#f0fdf4',
          color: msg.startsWith('Fejl') ? 'var(--c-err)' : 'var(--c-ok)',
          border: `1px solid ${msg.startsWith('Fejl') ? 'var(--c-err)' : 'var(--c-ok)'}`,
        }}>
          {msg}
        </div>
      )}

      {previews && previews.length > 0 && (
        <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: 480, overflowY: 'auto' }}>
          {previews.map((p, i) => (
            <div key={i} style={{ border: '1px solid var(--c-border)', borderRadius: 8, padding: '0.5rem 0.7rem' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.3rem' }}>
                {p.leagueName} · {p.date}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--c-muted)', whiteSpace: 'pre-wrap', marginBottom: '0.3rem' }}>
                <strong>Før:</strong> {p.oldText || '(tom)'}
              </div>
              <div style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
                <strong>Efter:</strong> {p.newText}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
