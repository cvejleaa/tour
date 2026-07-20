// Indstillinger-fanen (kun ejer). Pt. ét valg: tidspunktet for det AI-genererede
// morgenopslag (Tour-Botten). Gemmes i config/settings og læses af Cloud Function'en
// generateLeagueRecaps, så tidspunktet kan ændres uden gen-deploy.
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';
import { setRecapTime, setUntippedPenalty, callSendTestReminderToMe, callSendTipRemindersNow, callMigrateEmailPrivacy, callSetAutomationPaused, callSendThankYouEmails } from './adminActions';
import { DEFAULT_UNTIPPED_PENALTY, readUntippedPenalty } from '../leaderboard/useUntippedPenalty';

const DEFAULT_RECAP_TIME = '08:15';
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Vis straffen for en utippet etape som negativ point-tekst, fx "−2". */
function fmtPenalty(penalty) {
  const v = Math.abs(Number(penalty) || 0);
  const n = Number.isInteger(v) ? v : Math.round(v * 10) / 10;
  return n === 0 ? '0' : `−${n}`;
}

export default function SettingsTab() {
  const [time, setTime] = useState(DEFAULT_RECAP_TIME);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // 'saved' | 'error' | null

  // Straf for utippet etape (positivt tal; trækkes fra)
  const [penalty, setPenalty] = useState(DEFAULT_UNTIPPED_PENALTY);
  const [savingPen, setSavingPen] = useState(false);
  const [penStatus, setPenStatus] = useState(null);

  // 🏁 Afslutning: global pause + takke-mail
  const [paused, setPaused] = useState(false);
  const [pauseLoaded, setPauseLoaded] = useState(false);
  const [pauseBusy, setPauseBusy] = useState(false);
  const [pauseMsg, setPauseMsg] = useState(null);
  const [thankBusy, setThankBusy] = useState(false);
  const [thankMsg, setThankMsg] = useState(null);

  useEffect(() => {
    const ref = doc(db, COL.CONFIG, 'settings');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const d = snap && typeof snap.exists === 'function' && snap.exists() ? snap.data() : null;
        setTime((d && d.recapTime) || DEFAULT_RECAP_TIME);
        setPenalty(readUntippedPenalty(d));
        setLoaded(true);
      },
      () => setLoaded(true),
    );
    return unsub;
  }, []);

  // Global pause-tilstand (config/automation) — egen doc, egen lytter.
  useEffect(() => {
    const ref = doc(db, COL.CONFIG, 'automation');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const d = snap && typeof snap.exists === 'function' && snap.exists() ? snap.data() : null;
        setPaused(!!(d && d.paused));
        setPauseLoaded(true);
      },
      () => setPauseLoaded(true),
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

  // E-mail-påmindelser: test (kun til mig) + udløs den rigtige nu.
  const [mailBusy, setMailBusy] = useState('');
  const [mailMsg, setMailMsg] = useState('');
  const sendTestMail = async () => {
    setMailBusy('test'); setMailMsg('');
    const res = await callSendTestReminderToMe();
    setMailBusy('');
    setMailMsg(res.ok
      ? `✓ Testmail sendt til ${res.data?.sentTo ?? 'dig'} (${res.data?.stages ?? '?'} etaper over ${res.data?.days ?? '?'} dage).`
      : 'Fejl: ' + res.error);
  };
  const sendRealNow = async () => {
    setMailBusy('real'); setMailMsg('');
    const res = await callSendTipRemindersNow();
    setMailBusy('');
    if (!res.ok) { setMailMsg('Fejl: ' + res.error); return; }
    const d = res.data || {};
    setMailMsg(d.sent > 0
      ? `✓ Sendte ${d.sent} påmindelser.`
      : `Sendte 0 — ${d.reason === 'no-stages' ? 'ingen etaper inden for det næste døgn endnu (sender automatisk fra dagen før 1. etape).' : (d.reason || 'intet at sende lige nu.')}`);
  };

  const togglePause = async () => {
    const next = !paused;
    const q = next
      ? 'Sæt ALLE automatiske jobs på pause? Resultat-sync, AI-morgenopslag og påmindelses-mails stopper straks.'
      : 'Genoptag alle automatiske jobs? De begynder at køre igen efter deres skema.';
    if (!window.confirm(q)) return;
    setPauseBusy(true); setPauseMsg(null);
    const res = await callSetAutomationPaused(next);
    setPauseBusy(false);
    if (res.ok) setPauseMsg({ kind: 'ok', text: next ? 'Automatikken er sat på pause.' : 'Automatikken kører igen.' });
    else setPauseMsg({ kind: 'err', text: res.error });
  };

  const doThankYouDraft = async () => {
    setThankBusy(true); setThankMsg(null);
    const res = await callSendThankYouEmails({ dryRun: true });
    setThankBusy(false);
    if (res.ok) setThankMsg({ kind: 'ok', text: `Udkast sendt til dig (${res.data?.sentTo || 'din mail'}). Tjek din indbakke.` });
    else setThankMsg({ kind: 'err', text: res.error });
  };

  const doThankYouAll = async () => {
    if (!window.confirm('Send takke-mailen til ALLE spillere nu? Dette kan ikke fortrydes. Har du set udkastet i din egen indbakke først?')) return;
    if (!window.confirm('Helt sikker? Mailen sendes til alle godkendte spillere med en registreret mailadresse.')) return;
    setThankBusy(true); setThankMsg(null);
    const res = await callSendThankYouEmails({ dryRun: false });
    setThankBusy(false);
    if (res.ok) setThankMsg({ kind: 'ok', text: `Sendt til ${res.data?.sent ?? 0} spillere (${res.data?.failed ?? 0} fejlede, ${res.data?.noEmail ?? 0} uden mail).` });
    else setThankMsg({ kind: 'err', text: res.error });
  };

  // E-mail-privatliv: engangs-migrering (flyt e-mail til privat collection).
  const [migBusy, setMigBusy] = useState(false);
  const [migMsg, setMigMsg] = useState('');
  const runMigration = async () => {
    if (!window.confirm('Flyt alle e-mails til privat opbevaring? Kan køres flere gange uden skade.')) return;
    setMigBusy(true); setMigMsg('');
    const res = await callMigrateEmailPrivacy();
    setMigBusy(false);
    setMigMsg(res.ok
      ? `✓ Migrering færdig: ${res.data?.moved ?? 0} flyttet, ${res.data?.alreadyClean ?? 0} allerede private (af ${res.data?.totalUsers ?? '?'} brugere).`
      : 'Fejl: ' + res.error);
  };

  return (
    <div>
      <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: 'var(--c-pitch)' }}>
        🤖 AI-morgenopslag
      </h2>
      <p style={{ margin: '0 0 1rem', fontSize: '0.92rem', lineHeight: 1.5, color: 'var(--c-muted)' }}>
        Tour-Botten skriver hver morgen et kort opslag på væggen i hver liga med døgnets udvikling
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

      {/* ── Straf for utippet etape ─────────────────────────────────────── */}
      <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: 'var(--c-pitch)' }}>
        🎯 Straf for utippet etape
      </h2>
      <p style={{ margin: '0 0 1rem', fontSize: '0.92rem', lineHeight: 1.5, color: 'var(--c-muted)' }}>
        En etape man slet ikke har tippet trækker point fra. Vælg hvor mange
        point der trækkes fra pr. manglende etape (decimaler ok, fx 1,5). Vises som {fmtPenalty(penalty)} på stillingen.
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

      {/* ── E-mail-påmindelser om manglende tips ───────────────────────────── */}
      <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: 'var(--c-pitch)' }}>
        ✉️ Påmindelser om manglende tips
      </h2>
      <p style={{ margin: '0 0 1rem', fontSize: '0.92rem', lineHeight: 1.5, color: 'var(--c-muted)' }}>
        Spillere får automatisk en mail kl. 09.00 på etapedage, hvis de mangler at tippe på en
        etape inden for det næste døgn. <strong>Testmail</strong> sender de første 3 etapedage
        (med starttider) <em>kun til dig</em>. <strong>Send nu</strong> kører den rigtige
        udsendelse til alle med manglende tips.
      </p>
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn" onClick={sendTestMail} disabled={!!mailBusy} data-testid="send-test-reminder">
          {mailBusy === 'test' ? 'Sender…' : '🧪 Send testmail til mig'}
        </button>
        <button className="btn btn--ghost" onClick={sendRealNow} disabled={!!mailBusy} data-testid="send-reminders-now">
          {mailBusy === 'real' ? 'Sender…' : 'Send påmindelser nu'}
        </button>
        {mailMsg && (
          <span style={{ fontSize: '0.9rem', color: mailMsg.startsWith('Fejl') ? 'var(--c-err)' : 'var(--c-ok)' }}>
            {mailMsg}
          </span>
        )}
      </div>

      <hr style={{ margin: '1.75rem 0', border: 'none', borderTop: '1px solid var(--c-border)' }} />

      {/* ── E-mail-privatliv (engangs-migrering) ───────────────────────────── */}
      <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: 'var(--c-pitch)' }}>
        🔒 E-mail-privatliv
      </h2>
      <p style={{ margin: '0 0 1rem', fontSize: '0.92rem', lineHeight: 1.5, color: 'var(--c-muted)' }}>
        Spilleres e-mailadresser opbevares nu privat (kun du og admins kan se dem). Nye brugere
        gemmes automatisk sådan. Kør denne migrering <strong>én gang</strong> for at flytte de
        eksisterende adresser væk fra de offentlige profiler. Den kan trygt køres flere gange.
      </p>
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn" onClick={runMigration} disabled={migBusy} data-testid="migrate-email-privacy">
          {migBusy ? 'Migrerer…' : '🔒 Flyt e-mails til privat opbevaring'}
        </button>
        {migMsg && (
          <span style={{ fontSize: '0.9rem', color: migMsg.startsWith('Fejl') ? 'var(--c-err)' : 'var(--c-ok)' }}>
            {migMsg}
          </span>
        )}
      </div>

      <hr style={{ margin: '1.75rem 0', border: 'none', borderTop: '1px solid var(--c-border)' }} />

      {/* ── 🏁 Afslutning af løbet ──────────────────────────────────────── */}
      <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: 'var(--c-pitch)' }}>
        🏁 Afslutning af løbet
      </h2>

      <p style={{ margin: '0 0 0.75rem', fontSize: '0.92rem', lineHeight: 1.5, color: 'var(--c-muted)' }}>
        Når Touren er slut: sæt al automatik på pause (resultat-sync, AI-morgenopslag og
        påmindelses-mails) og send den afsluttende takke-mail til spillerne. Pausen kan slås fra igen når som helst.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Automatik:</span>
        <button
          className={`btn btn--sm${paused ? ' btn--primary' : ''}`}
          onClick={togglePause} disabled={pauseBusy || !pauseLoaded} data-testid="toggle-automation"
        >
          {pauseBusy ? 'Skifter…' : paused ? '▶ Genoptag automatik' : '⏸ Sæt automatik på pause'}
        </button>
        <span style={{ fontSize: '0.85rem', color: paused ? 'var(--c-err)' : 'var(--c-ok)' }}>
          {pauseLoaded ? (paused ? '● Sat på pause' : '● Kører') : '…'}
        </span>
      </div>
      {pauseMsg && (
        <p style={{ marginTop: '0.6rem', fontSize: '0.9rem', color: pauseMsg.kind === 'ok' ? 'var(--c-ok)' : 'var(--c-err)' }}>
          {pauseMsg.kind === 'ok' ? '✓ ' : ''}{pauseMsg.text}
        </p>
      )}

      <div style={{ marginTop: '1.1rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn" onClick={doThankYouDraft} disabled={thankBusy} data-testid="thankyou-draft">
          {thankBusy ? 'Arbejder…' : '✉️ Send udkast til mig'}
        </button>
        <button className="btn btn--primary" onClick={doThankYouAll} disabled={thankBusy} data-testid="thankyou-all">
          {thankBusy ? 'Sender…' : '📣 Send takke-mail til alle'}
        </button>
        <span style={{ fontSize: '0.82rem', color: 'var(--c-muted)' }}>Se altid udkastet i din egen indbakke først.</span>
      </div>
      {thankMsg && (
        <p style={{ marginTop: '0.6rem', fontSize: '0.9rem', color: thankMsg.kind === 'ok' ? 'var(--c-ok)' : 'var(--c-err)' }}>
          {thankMsg.kind === 'ok' ? '✓ ' : ''}{thankMsg.text}
        </p>
      )}
    </div>
  );
}
