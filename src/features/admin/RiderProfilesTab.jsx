// ---------------------------------------------------------------------------
// RiderProfilesTab – admin: rediger rytter-karakteristika (type + frie tags +
// noter) og styr AI-berigelsen fra live-tickeren.
//
// Manuelle felter skrives til config/riderProfiles.riders.<bib>. AI-tags (aiRaw)
// kan fjernes enkeltvis. "Kør AI-berigelse nu" kalder enrichRiderTagsNow —
// nyttig til at hente etaper der allerede er kørt (auto-jobbet tager fremtidige).
// ---------------------------------------------------------------------------
import { useMemo, useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import { RIDERS, riderInfo, profileLabel, prettyRiderName } from '../../data/ridersTdf2026';
import { prettyTeam, teamMeta } from '../../data/tourTeams2026';
import { useRiderProfiles } from '../riders/useRiderProfiles';

const PROFILES = ['leader', 'climber', 'sprinter', 'polyvalent'];
const PROFILE_REF = doc(db, 'config', 'riderProfiles');

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export default function RiderProfilesTab() {
  const { riders, aiRaw, tagsForBib, typeForBib } = useRiderProfiles();
  const [query, setQuery] = useState('');
  const [editBib, setEditBib] = useState(null);
  const [editType, setEditType] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [stageInput, setStageInput] = useState('');
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState('');

  const matches = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return [];
    return RIDERS
      .filter((r) => norm(`${r.first} ${r.last} ${r.team}`).includes(q))
      .slice(0, 40);
  }, [query]);

  function startEdit(bib) {
    const p = riders[bib] || {};
    setEditBib(bib);
    setEditType(p.type || '');
    setEditTags(((p.tags || []).map((t) => (typeof t === 'string' ? t : t.label)).join(', ')));
    setEditNotes(p.notes || '');
  }

  async function save() {
    if (editBib == null) return;
    setSaving(true);
    try {
      const tags = editTags.split(',').map((s) => s.trim()).filter(Boolean);
      await setDoc(PROFILE_REF, {
        riders: { [editBib]: { type: editType || null, tags, notes: editNotes.trim() || null } },
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setEditBib(null);
    } finally {
      setSaving(false);
    }
  }

  // Fjern ét AI-tag: matches på RESOLVERET startnummer (aiRaw gemmer AI'ens
  // egen stavning af navnet), tag og etape.
  async function removeAiTag(bib, tag, stage) {
    const next = (aiRaw || []).filter((t) => {
      const info = riderInfo(t.rider);
      const sameBib = info && Number(info.bib) === Number(bib);
      return !(sameBib
        && String(t.tag).toLowerCase() === String(tag).toLowerCase()
        && (t.stage ?? null) === (stage ?? null));
    });
    await setDoc(PROFILE_REF, { aiRaw: next, updatedAt: serverTimestamp() }, { merge: true });
  }

  async function runEnrich() {
    setRunning(true);
    setRunMsg('');
    try {
      const fn = httpsCallable(functions, 'enrichRiderTagsNow');
      const stage = Number(stageInput);
      const payload = Number.isInteger(stage) && stage >= 1 && stage <= 21 ? { stage } : {};
      const res = await fn(payload);
      const results = res.data?.results || [];
      const added = results.reduce((n, r) => n + (r.added || 0), 0);
      setRunMsg(`Behandlede ${results.length} etape(r), ${added} nye AI-tag(s).`);
    } catch (err) {
      setRunMsg(`Fejl: ${err?.message || err}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <div>
        <h2 className="card__title" style={{ margin: '0 0 0.25rem' }}>🏷️ Ryttertyper & karakteristika</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--c-muted)', margin: 0 }}>
          Ret en rytters type, tilføj frie tags (fx <em>baroudeur</em>) og noter. AI udleder selv tags
          fra live-tickeren efter hver etape (mærket ✨) — dem kan du fjerne her.
        </p>
      </div>

      {/* AI-berigelse */}
      <div className="card" style={{ padding: '0.75rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <strong style={{ fontSize: '0.88rem' }}>✨ AI-berigelse</strong>
        <input
          type="number" min="1" max="21" value={stageInput}
          onChange={(e) => setStageInput(e.target.value)}
          placeholder="etape (tom = alle)"
          style={{ width: 140 }}
        />
        <button type="button" className="btn btn--sm" onClick={runEnrich} disabled={running}>
          {running ? 'Kører…' : 'Kør AI-berigelse nu'}
        </button>
        {runMsg && <span style={{ fontSize: '0.82rem', color: 'var(--c-muted)' }}>{runMsg}</span>}
      </div>

      {/* Søg */}
      <div>
        <input
          type="text" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Søg rytter eller hold…"
          style={{ width: '100%', maxWidth: 360 }}
          data-testid="rider-search"
        />
        {query.trim() && matches.length === 0 && (
          <p style={{ fontSize: '0.82rem', color: 'var(--c-muted)' }}>Ingen ryttere matcher.</p>
        )}
        <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.6rem' }}>
          {matches.map((r) => {
            const bib = r.bib;
            const name = prettyRiderName(`${r.first} ${r.last}`);
            const meta = teamMeta(r.team);
            const teamName = meta ? prettyTeam(meta.name) : r.team;
            const effType = typeForBib(bib, r.profile);
            const tags = tagsForBib(bib);
            const editing = editBib === bib;
            return (
              <div key={bib} className="card" style={{ padding: '0.6rem' }} data-testid="rider-edit-card">
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <strong>{name}</strong>
                  <span style={{ color: 'var(--c-muted)', fontSize: '0.82rem' }}>{teamName}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--c-pitch)' }}>
                    {profileLabel(effType)?.label || effType}
                    {riders[bib]?.type ? ' (rettet)' : ''}
                  </span>
                  {!editing && (
                    <button type="button" className="btn btn--ghost btn--sm" style={{ marginLeft: 'auto' }} onClick={() => startEdit(bib)}>
                      ✏️ Rediger
                    </button>
                  )}
                </div>

                {tags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                    {tags.map((t) => (
                      <span key={`${t.source}-${t.label}`} style={{ fontSize: '0.72rem', padding: '0 6px', borderRadius: 999, background: 'var(--c-surface-alt,#eef3f0)' }}>
                        {t.source === 'ai' ? '✨' : ''}{t.label}
                        {t.source === 'ai' && (
                          <button
                            type="button"
                            onClick={() => removeAiTag(bib, t.label, t.stage)}
                            title="Fjern AI-tag"
                            style={{ marginLeft: 3, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--c-muted)' }}
                          >×</button>
                        )}
                      </span>
                    ))}
                  </div>
                )}

                {editing && (
                  <div style={{ display: 'grid', gap: '0.4rem', marginTop: '0.5rem' }}>
                    <label style={{ fontSize: '0.8rem' }}>
                      Type:{' '}
                      <select value={editType} onChange={(e) => setEditType(e.target.value)}>
                        <option value="">(arv fra letour: {r.profile})</option>
                        {PROFILES.map((p) => (
                          <option key={p} value={p}>{profileLabel(p)?.label || p}</option>
                        ))}
                      </select>
                    </label>
                    <label style={{ fontSize: '0.8rem' }}>
                      Tags (komma-adskilt):
                      <input type="text" value={editTags} onChange={(e) => setEditTags(e.target.value)} style={{ width: '100%' }} />
                    </label>
                    <label style={{ fontSize: '0.8rem' }}>
                      Noter:
                      <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2} style={{ width: '100%' }} />
                    </label>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button type="button" className="btn btn--sm" onClick={save} disabled={saving}>
                        {saving ? 'Gemmer…' : 'Gem'}
                      </button>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditBib(null)}>Annullér</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
