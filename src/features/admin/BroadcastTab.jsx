// "Send mail"-fanen: skriv en fritekst-besked og send den til en liste af
// modtagere (fx invitationer). Bruger Cloud Function sendBroadcastEmail.
import { useMemo, useState } from 'react';
import { callSendBroadcastEmail } from './adminActions';
import { parseRecipients } from './broadcastUtils';
import { useUsers } from './useUsers';

const DEFAULT_SUBJECT = 'Kom og tab til mig i Tour de France 🚴💨';
const DEFAULT_BODY = `Kære familie,

Ingen af os ved en pind om cykling — og det er præcis derfor, det bliver sjovt. På tour.vejleaa.dk tipper du holdene før hver etape: etapevinder, bedste hold, bjerg- og sprintpoint. Ren magefornemmelse, to minutter om dagen, og lige vilkår for os alle sammen.

Og så er der bonusspørgsmål undervejs — store gæt om hele løbet, der giver ekstra point og kan vende stillingen på hovedet til allersidst. Så ingen er ude, før Paris er nået.

Vores egen familie-liga, daglig stilling og fuld ret til at drille den, der ligger sidst. Opret en bruger, så hiver jeg dig ind.

Første etape ruller 4. juli. Held er også en evne — har du den?

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

  const { valid, invalid } = useMemo(() => parseRecipients(recipientsText), [recipientsText]);
  const canSend = subject.trim() && body.trim() && valid.length > 0 && !busy;

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
    const res = await callSendBroadcastEmail({ subject: subject.trim(), body: body.trim(), recipients: valid });
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
        Adresser kan adskilles med komma, semikolon, mellemrum eller linjeskift. Teksten sendes som en
        pæn e-mail med et link til siden.
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
