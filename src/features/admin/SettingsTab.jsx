// Indstillinger-fanen (kun ejer). Pt. ét valg: tidspunktet for det AI-genererede
// morgenopslag (VM-Botten). Gemmes i config/settings og læses af Cloud Function'en
// generateLeagueRecaps, så tidspunktet kan ændres uden gen-deploy.
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';
import { setRecapTime, setUntippedPenalty, callPostSharpshooterNote } from './adminActions';
import { DEFAULT_UNTIPPED_PENALTY } from '../leaderboard/useUntippedPenalty';
import { fmtPenalty } from '../leaderboard/sharpFormat';

const DEFAULT_RECAP_TIME = '08:15';
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function SettingsTab() {
  const [time, setTime] = useState(DEFAULT_RECAP_TIME);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // 'saved' | 'error' | null

  // Skarpskytten: straf for utippet kamp (positivt tal; trækkes fra)
  const [penalty, setPenalty] = useState(DEFAULT_UNTIPPED_PENALTY);
  const [savingPen, setSavingPen] = useState(false);
  const [penStatus, setPenStatus] = useState(null);

  // Vægopslag om Skarpskytten (forhåndsvis → slå op)
  const [preview, setPreview] = useState(null); // { text, leagues } | null
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteMsg, setNoteMsg] = useState(null); // { kind:'ok'|'err', text } | null

  useEffect(() => {
    const ref = doc(db, COL.CONFIG, 'settings');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const d = snap && typeof snap.exists === 'function' && snap.exists() ? snap.data() : null;
        setTime((d && d.recapTime) || DEFAULT_RECAP_TIME);
        const p = d && Number.isFinite(Number(d.untippedPenalty)) ? Math.abs(Number(d.untippedPenalty)) : DEFAULT_UNTIPPED_PENALTY;
        setPenalty(p);
        setLoaded(true);
      },
      () => setLoaded(true),
    );
    return unsub;
  }, []);

  const valid = TIME_RE.test(time);

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    setStatus(null);
    try {
      await setRecapTime(time);
      setStatus('saved');
    } catch {
      setStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const savePenalty = async () => {
    setSavingPen(true);
    setPenStatus(null);
    try {
      await setUntippedPenalty(penalty);
      setPenStatus('saved');
    } catch {
      setPenStatus('error');
    } finally {
      setSavingPen(false);
    }
  };

  const doPreview = async () => {
    setNoteBusy(true);
    setNoteMsg(null);
    const res = await callPostSharpshooterNote({ dryRun: true });
    setNoteBusy(false);
    if (res.ok) setPreview({ text: res.data?.text || '', leagues: res.data?.leagues ?? 0 });
    else setNoteMsg({ kind: 'err', text: res.error });
  };

  const doPost = async () => {
    if (!window.confirm('Slå opslaget op på ALLE ligavægge nu? Det kan ikke fortrydes uden at slette på hver væg.')) return;
    setNoteBusy(true);
    setNoteMsg(null);
    const res = await callPostSharpshooterNote({ dryRun: false });
    setNoteBusy(false);
    if (res.ok) {
      setPreview(null);
      setNoteMsg({ kind: 'ok', text: `Slået op på ${res.data?.leagues ?? 0} ligavægge.` });
    } else {
      setNoteMsg({ kind: 'err', text: res.error });
    }
  };

  return (
    <div>
      <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: 'var(--c-pitch)' }}>
        🤖 AI-morgenopslag
      </h2>
      <p style={{ margin: '0 0 1rem', fontSize: '0.92rem', lineHeight: 1.5, color: 'var(--c-muted)' }}>
        VM-Botten skriver hver morgen et kort opslag på væggen i hver liga med døgnets udvikling
        og en lille optakt. Vælg hvornår det udgives (dansk tid).
      </p>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem', fontWeight: 600 }}>
          Udgivelsestidspunkt
          <input
            type="time"
            value={time}
            onChange={(e) => { setTime(e.target.value); setStatus(null); }}
            data-testid="recap-time"
            style={{ padding: '0.45rem 0.6rem', fontSize: '1rem', border: '1px solid var(--c-border)', borderRadius: 6 }}
          />
        </label>
        <button
          className="btn btn--primary"
          onClick={save}
          disabled={!valid || saving || !loaded}
          data-testid="save-recap-time"
        >
          {saving ? 'Gemmer…' : 'Gem'}
        </button>
        {status === 'saved' && <span style={{ color: 'var(--c-ok)', fontSize: '0.9rem' }}>✓ Gemt</span>}
        {status === 'error' && <span style={{ color: 'var(--c-err)', fontSize: '0.9rem' }}>Kunne ikke gemme.</span>}
        {!valid && <span style={{ color: 'var(--c-err)', fontSize: '0.9rem' }}>Ugyldigt tidspunkt.</span>}
      </div>

      <p style={{ margin: '1rem 0 0', fontSize: '0.8rem', color: 'var(--c-muted)' }}>
        Opslaget udgives én gang i døgnet, tidligst på det valgte tidspunkt. Standard er {DEFAULT_RECAP_TIME}.
      </p>

      <hr style={{ margin: '1.75rem 0', border: 'none', borderTop: '1px solid var(--c-border)' }} />

      {/* ── 🎯 Skarpskytten: straf for utippet kamp ─────────────────────── */}
      <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: 'var(--c-pitch)' }}>
        🎯 Skarpskytten — straf for utippet kamp
      </h2>
      <p style={{ margin: '0 0 1rem', fontSize: '0.92rem', lineHeight: 1.5, color: 'var(--c-muted)' }}>
        En kamp man ikke har tippet trækker point fra i Skarpskytten-stillingen. Vælg hvor mange
        point der trækkes fra pr. manglende kamp (decimaler ok, fx 1,5). Vises som {fmtPenalty(penalty)} på stillingen.
      </p>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem', fontWeight: 600 }}>
          Straf (point der trækkes fra) −
          <input
            type="number"
            step="0.5"
            min="0"
            value={penalty}
            onChange={(e) => {
              const v = Number(e.target.value);
              setPenalty(Number.isFinite(v) ? Math.abs(v) : 0);
              setPenStatus(null);
            }}
            data-testid="untipped-penalty"
            style={{ padding: '0.45rem 0.6rem', fontSize: '1rem', width: '6rem', border: '1px solid var(--c-border)', borderRadius: 6 }}
          />
        </label>
        <button
          className="btn btn--primary"
          onClick={savePenalty}
          disabled={savingPen || !loaded}
          data-testid="save-untipped-penalty"
        >
          {savingPen ? 'Gemmer…' : 'Gem'}
        </button>
        {penStatus === 'saved' && <span style={{ color: 'var(--c-ok)', fontSize: '0.9rem' }}>✓ Gemt</span>}
        {penStatus === 'error' && <span style={{ color: 'var(--c-err)', fontSize: '0.9rem' }}>Kunne ikke gemme.</span>}
      </div>

      <hr style={{ margin: '1.75rem 0', border: 'none', borderTop: '1px solid var(--c-border)' }} />

      {/* ── Opslag om Skarpskytten på alle vægge ────────────────────────── */}
      <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: 'var(--c-pitch)' }}>
        📣 Forklar Skarpskytten på alle vægge
      </h2>
      <p style={{ margin: '0 0 1rem', fontSize: '0.92rem', lineHeight: 1.5, color: 'var(--c-muted)' }}>
        Slå en fast, klar forklaring af Skarpskytten op på væggen i alle ligaer (forfattet af VM-Botten).
        Forhåndsvis teksten først, og slå den derefter op.
      </p>
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <button className="btn" onClick={doPreview} disabled={noteBusy} data-testid="preview-sharp-note">
          {noteBusy && !preview ? 'Henter…' : 'Forhåndsvis'}
        </button>
        <button className="btn btn--primary" onClick={doPost} disabled={noteBusy || !preview} data-testid="post-sharp-note">
          {noteBusy && preview ? 'Slår op…' : 'Slå op på alle vægge'}
        </button>
      </div>
      {noteMsg && (
        <p style={{ marginTop: '0.75rem', fontSize: '0.9rem', color: noteMsg.kind === 'ok' ? 'var(--c-ok)' : 'var(--c-err)' }}>
          {noteMsg.kind === 'ok' ? '✓ ' : ''}{noteMsg.text}
        </p>
      )}
      {preview && (
        <div style={{ marginTop: '0.9rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--c-muted)', marginBottom: '0.3rem' }}>
            Forhåndsvisning — slås op på {preview.leagues} {preview.leagues === 1 ? 'væg' : 'vægge'}:
          </div>
          <div
            data-testid="sharp-note-preview"
            style={{ whiteSpace: 'pre-wrap', background: 'var(--c-surface-2, #f7f7f7)', borderRadius: 10, padding: '0.75rem 0.9rem', fontSize: '0.9rem', lineHeight: 1.5 }}
          >
            {preview.text}
          </div>
        </div>
      )}
    </div>
  );
}
