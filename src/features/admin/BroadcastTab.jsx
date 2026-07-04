// "Send mail"-fanen: skriv en fritekst-besked og send den til en liste af
// modtagere (fx invitationer). Bruger Cloud Function sendBroadcastEmail.
// Vælges en liga, flettes dens DIREKTE tilmeldingslink (/tilmeld?kode=…) ind
// hvor [LINK] står i teksten — modtageren oprettes, godkendes og tilmeldes
// ligaen automatisk med ét klik.
import { useMemo, useState } from 'react';
import { callSendBroadcastEmail } from './adminActions';
import { parseRecipients } from './broadcastUtils';
import { useUsers } from './useUsers';
import { useAllLeagues } from '../leagues/useAllLeagues';
import { joinLinkFor } from '../leagues/joinLink';
import { LEAGUE_STATUS } from '../../lib/constants';

/** Markør i brødteksten der erstattes med den valgte ligas tilmeldingslink. */
const LINK_TOKEN = '[LINK]';

const DEFAULT_SUBJECT = '🚨 SIDSTE CHANCE: Touren ruller i dag kl. 17.05 – er du med?';
const DEFAULT_BODY = `Kære familie og venner,

I DAG kl. 17.05 ruller Tour de France ud fra Barcelona – og så smækker døren for at være med fra allerførste etape i vores tippespil. Det her bliver sommerens samtaleemne i tre uger. Vil du virkelig stå udenfor, når vi andre driller hinanden ved morgenbordet?

Det tager 2 minutter om dagen – og kræver NUL cykelviden:
• Tip cykelhold på fire enkle spørgsmål før hver etape – ren mavefornemmelse
• Bonusspørgsmål om gul trøje & co. kan vende HELE stillingen til allersidst
• Vores egen liga med daglig stilling, live-resultater, trøje-overblik og en morgen-bot, der uddeler kærlige stikpiller
• Alt samlet på tour.vejleaa.dk – og det spiller på mobilen

Og det er blevet nemmere end nogensinde at komme med. Klik på linket, opret dig med navn og adgangskode – så er du AUTOMATISK godkendt og med i vores liga. Intet at taste, ingen ventetid:

${LINK_TOKEN}

Første etape er en holdtidskørsel i Barcelona i aften – dit første tip venter allerede. I morgen er du enten med i snakken eller udenfor den.

Held er også en evne. Har du den?

Kærlig (men nådesløs) hilsen`;

const inputStyle = {
  padding: '0.55rem 0.7rem', border: '1px solid var(--c-border)', borderRadius: 8,
  fontSize: '0.95rem', background: 'var(--c-bg)', color: 'var(--c-text)', width: '100%',
};

export default function BroadcastTab() {
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [recipientsText, setRecipientsText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const { users } = useUsers();
  const approvedEmails = useMemo(
    () => users.filter((u) => u.status === 'approved' && u.email).map((u) => u.email),
    [users],
  );

  // Liga-invitation: vælg hvilken liga modtagerne inviteres med i.
  // [LINK] i teksten erstattes ved afsendelse med ligaens /tilmeld-link.
  const { leagues } = useAllLeagues();
  const [leagueId, setLeagueId] = useState('');
  const approvedLeagues = useMemo(
    () => (leagues ?? []).filter((l) => l.status === LEAGUE_STATUS.APPROVED && l.joinCode),
    [leagues],
  );
  const selectedLeague = approvedLeagues.find((l) => l.id === leagueId) ?? null;
  const joinLink = selectedLeague ? joinLinkFor(selectedLeague.joinCode) : '';
  const needsLeague = body.includes(LINK_TOKEN) && !selectedLeague;

  const { valid, invalid } = useMemo(() => parseRecipients(recipientsText), [recipientsText]);
  const canSend = subject.trim() && body.trim() && valid.length > 0 && !busy && !needsLeague;

  // Tilføj godkendte spilleres mails til listen (uden dubletter, behold det skrevne).
  function addApproved() {
    const existing = String(recipientsText).split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    const seen = new Set(existing.map((e) => e.toLowerCase()));
    const additions = approvedEmails.filter((e) => !seen.has(e.toLowerCase()));
    setRecipientsText([...existing, ...additions].join('\n'));
  }

  async function handleSend() {
    if (!canSend) return;
    if (!window.confirm(`Send beskeden til ${valid.length} modtager${valid.length === 1 ? '' : 'e'}?`)) return;
    setBusy(true); setMsg('');
    // Flet den valgte ligas tilmeldingslink ind hvor [LINK] står.
    const finalBody = joinLink ? body.split(LINK_TOKEN).join(joinLink) : body;
    const res = await callSendBroadcastEmail({ subject: subject.trim(), body: finalBody.trim(), recipients: valid });
    setBusy(false);
    if (!res.ok) { setMsg('Fejl: ' + res.error); return; }
    const d = res.data || {};
    const failTxt = d.failed?.length ? ` · ${d.failed.length} fejlede` : '';
    setMsg(`✓ Sendt til ${d.sent}/${d.total}${failTxt}.`);
  }

  return (
    <div>
      <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: 'var(--c-pitch)' }}>📣 Send mail</h2>
      <p style={{ margin: '0 0 1rem', fontSize: '0.92rem', lineHeight: 1.5, color: 'var(--c-muted)' }}>
        Skriv en besked og send den til en liste af modtagere — fx en invitation til familie og venner.
        Vælg en liga, så erstattes <strong>[LINK]</strong> i teksten med ligaens direkte
        tilmeldingslink: modtageren oprettes, godkendes og tilmeldes ligaen med ét klik.
        Adresser kan adskilles med komma, semikolon, mellemrum eller linjeskift.
      </p>

      <div style={{ display: 'grid', gap: '0.75rem', maxWidth: 680 }}>
        <label style={{ fontSize: '0.8rem', color: 'var(--c-muted)' }}>
          Emne
          <input
            type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
            style={{ ...inputStyle, marginTop: '0.25rem' }} data-testid="broadcast-subject"
          />
        </label>

        <label style={{ fontSize: '0.8rem', color: 'var(--c-muted)' }}>
          Invitér til liga ([LINK] i teksten bliver til ligaens tilmeldingslink)
          <select
            value={leagueId} onChange={(e) => setLeagueId(e.target.value)}
            style={{ ...inputStyle, marginTop: '0.25rem' }} data-testid="broadcast-league"
          >
            <option value="">– vælg liga –</option>
            {approvedLeagues.map((l) => (
              <option key={l.id} value={l.id}>{l.name} (kode: {l.joinCode})</option>
            ))}
          </select>
          {joinLink && (
            <span style={{ display: 'block', marginTop: '0.25rem', fontSize: '0.78rem', wordBreak: 'break-all' }} data-testid="broadcast-join-link">
              Linket der flettes ind: {joinLink}
            </span>
          )}
          {needsLeague && (
            <span style={{ display: 'block', marginTop: '0.25rem', fontSize: '0.78rem', color: 'var(--c-warn)' }} data-testid="broadcast-needs-league">
              Teksten indeholder [LINK] — vælg en liga (eller fjern [LINK]) for at kunne sende.
            </span>
          )}
        </label>

        <label style={{ fontSize: '0.8rem', color: 'var(--c-muted)' }}>
          Besked
          <textarea
            value={body} onChange={(e) => setBody(e.target.value)} rows={12}
            style={{ ...inputStyle, marginTop: '0.25rem', resize: 'vertical', fontFamily: 'inherit' }}
            data-testid="broadcast-body"
          />
        </label>

        <label style={{ fontSize: '0.8rem', color: 'var(--c-muted)' }}>
          Modtagere
          <textarea
            value={recipientsText} onChange={(e) => setRecipientsText(e.target.value)} rows={4}
            placeholder="mor@example.com, far@example.com&#10;soester@example.com"
            style={{ ...inputStyle, marginTop: '0.25rem', resize: 'vertical' }}
            data-testid="broadcast-recipients"
          />
        </label>

        <div>
          <button
            type="button" className="btn btn--ghost btn--sm"
            onClick={addApproved} disabled={approvedEmails.length === 0}
            data-testid="broadcast-add-approved"
          >
            ➕ Indsæt godkendte spilleres mails ({approvedEmails.length})
          </button>
        </div>

        <div style={{ fontSize: '0.82rem', color: 'var(--c-muted)' }} data-testid="broadcast-count">
          {valid.length} gyldige modtager{valid.length === 1 ? '' : 'e'}
          {invalid.length > 0 && (
            <span style={{ color: 'var(--c-warn)' }}> · {invalid.length} ugyldige: {invalid.join(', ')}</span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn" onClick={handleSend} disabled={!canSend} data-testid="broadcast-send">
            {busy ? 'Sender…' : `Send til ${valid.length}`}
          </button>
          {msg && (
            <span style={{ fontSize: '0.9rem', color: msg.startsWith('Fejl') ? 'var(--c-err)' : 'var(--c-ok)' }}>
              {msg}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
