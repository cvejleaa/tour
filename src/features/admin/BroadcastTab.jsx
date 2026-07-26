// "Send mail"-fanen: skriv en fritekst-besked og send den til en liste af
// modtagere (fx invitationer). Bruger Cloud Function sendBroadcastEmail.
// Vælges en liga, flettes dens DIREKTE tilmeldingslink (/tilmeld?kode=…) ind
// hvor [LINK] står i teksten — modtageren oprettes, godkendes og tilmeldes
// ligaen automatisk med ét klik.
import { useEffect, useMemo, useState } from 'react';
import { callSendBroadcastEmail } from './adminActions';
import { fetchLegacyResults, applyLegacyResult } from './legacyResults';
import { parseRecipients } from './broadcastUtils';
import { useUsers } from './useUsers';
import { useAllLeagues } from '../leagues/useAllLeagues';
import { useGames } from '../games/useGames';
import { useGameLeagues } from '../games/useGameLeagues';
import { joinLinkFor, gameJoinLinkFor } from '../leagues/joinLink';
import { LEAGUE_STATUS } from '../../lib/constants';
import { PLATFORM_MODE } from '../../lib/platform';

/** Markør i brødteksten der erstattes med den valgte ligas tilmeldingslink. */
const LINK_TOKEN = '[LINK]';

// På den samlede platform starter en udsendelse med blanke felter — den
// Tour-specifikke salgstale-skabelon hører til under det enkelte spil (Fase B).
const DEFAULT_SUBJECT = PLATFORM_MODE
  ? ''
  : '🚨 SIDSTE CHANCE: Touren ruller i dag kl. 17.05 – er du med?';

/** Kort personlig intro til SALGSTALE-skabelonen (mailens hero, skærmbilleder
 *  og den gule tilmeldingsblok kommer fra skabelonen — introen står øverst). */
const TEMPLATE_INTRO = PLATFORM_MODE
  ? ''
  : `Kære familie og venner,

I DAG kl. 17.05 smækker døren for at være med fra allerførste etape. Tre ugers fælles sommerdrilleri venter — og I vil ikke stå udenfor, når vi andre driller hinanden ved morgenbordet. Klik på den gule knap nederst, så er I med på ét minut. Vi ses på ranglisten!`;

const DEFAULT_BODY = PLATFORM_MODE
  ? ''
  : `Kære familie og venner,

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
  // Salgstale-skabelonen (hero + skærmbilleder + gul tilmeldingsblok) er
  // standard i enkelt-spillet — det er kampagne-mailen. Slå fra for en ren
  // tekstmail. På platformen er den Tour-specifikke skabelon slået fra som
  // udgangspunkt, så admin starter fra en blank tekstmail.
  const [useTemplate, setUseTemplate] = useState(!PLATFORM_MODE);
  const [body, setBody] = useState(PLATFORM_MODE ? DEFAULT_BODY : TEMPLATE_INTRO);
  const [recipientsText, setRecipientsText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  function toggleTemplate() {
    const next = !useTemplate;
    setUseTemplate(next);
    // Skift kun standardteksten hvis admin ikke selv har redigeret den.
    if (next && body === DEFAULT_BODY) setBody(TEMPLATE_INTRO);
    if (!next && body === TEMPLATE_INTRO) setBody(DEFAULT_BODY);
  }

  const { users } = useUsers();
  const approvedEmails = useMemo(
    () => users.filter((u) => u.status === 'approved' && u.email).map((u) => u.email),
    [users],
  );

  // Liga-invitation: vælg hvilken liga modtagerne inviteres med i.
  // [LINK] i teksten erstattes ved afsendelse med ligaens /tilmeld-link.
  //
  // Tour: top-niveau-ligaer (joinCode). Platform: vælg FØRST spil, så en liga
  // i det spil (code) — linket bærer både spil-id og kode, og modtageren
  // auto-godkendes + tilmeldes spil + liga med ét klik.
  const { leagues: topLeagues } = useAllLeagues(!PLATFORM_MODE);
  const { games } = useGames();
  const [gameId, setGameId] = useState('');
  const { leagues: gameLeagues } = useGameLeagues(PLATFORM_MODE ? gameId : null);
  const [leagueId, setLeagueId] = useState('');

  // Nulstil ligavalget når spillet skifter.
  const onGameChange = (id) => { setGameId(id); setLeagueId(''); };

  const leagueOptions = useMemo(() => {
    if (PLATFORM_MODE) {
      return (gameLeagues ?? []).map((l) => ({ id: l.id, name: l.name, code: l.code }));
    }
    return (topLeagues ?? [])
      .filter((l) => l.status === LEAGUE_STATUS.APPROVED && l.joinCode)
      .map((l) => ({ id: l.id, name: l.name, code: l.joinCode }));
  }, [topLeagues, gameLeagues]);

  const selectedLeague = leagueOptions.find((l) => l.id === leagueId) ?? null;
  const joinLink = selectedLeague
    ? (PLATFORM_MODE ? gameJoinLinkFor(gameId, selectedLeague.code) : joinLinkFor(selectedLeague.code))
    : '';
  // Skabelonens gule knap SKAL pege på en liga; ren tekst kræver kun liga
  // hvis [LINK] faktisk står i teksten.
  const needsLeague = (useTemplate || body.includes(LINK_TOKEN)) && !selectedLeague;

  // 🏁 Tilbageblik: top 5 fra de GAMLE spils ligaer (Tour/VM) — eksporteret af
  // export-legacy-leagues-workflowet. Kun platform.
  const [legacy, setLegacy] = useState([]);
  const [legacyId, setLegacyId] = useState('');
  const [legacyMsg, setLegacyMsg] = useState('');
  useEffect(() => {
    if (!PLATFORM_MODE) return undefined;
    let alive = true;
    fetchLegacyResults().then((res) => { if (alive && res.ok) setLegacy(res.results); });
    return () => { alive = false; };
  }, []);
  const selectedLegacy = legacy.find((l) => l.id === legacyId) ?? null;

  function insertLegacyTop5() {
    if (!selectedLegacy) return;
    const out = applyLegacyResult({ subject, body, result: selectedLegacy });
    setSubject(out.subject);
    setBody(out.body);
    setLegacyMsg(`Top 5 fra "${selectedLegacy.name}" er sat ind.`);
  }

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
    const res = await callSendBroadcastEmail({
      subject: subject.trim(),
      body: finalBody.trim(),
      recipients: valid,
      // Salgstale-skabelon: serveren bygger HTML'en med skærmbilleder + gul
      // tilmeldingsblok; teksten ovenfor bliver mailens personlige intro.
      ...(useTemplate ? { template: 'salespitch', joinLink, leagueName: selectedLeague?.name } : {}),
    });
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
        {PLATFORM_MODE ? (
          <>
            Skriv en besked og send den til en liste af modtagere. Sætter du [LINK] ind i
            teksten, flettes den valgte ligas tilmeldingslink ind (modtageren oprettes,
            godkendes og tilmeldes med ét klik).
            Adresser kan adskilles med komma, semikolon, mellemrum eller linjeskift.
          </>
        ) : (
          <>
            Send invitationen til familie og venner. Med <strong>salgstale-skabelonen</strong> sendes
            den flotte mail med skærmbilleder og den gule tilmeldingsblok — teksten nedenfor bliver
            mailens personlige intro, og knappen i den gule blok er ligaens direkte tilmeldingslink
            (modtageren oprettes, godkendes og tilmeldes med ét klik).
            Adresser kan adskilles med komma, semikolon, mellemrum eller linjeskift.
          </>
        )}
      </p>

      <div style={{ display: 'grid', gap: '0.75rem', maxWidth: 680 }}>
        {/* Salgstale-skabelonen (Tour-skærmbilleder) hører til under det enkelte
            spil (Fase B) — skjules på den samlede platform. */}
        {!PLATFORM_MODE && (
          <label style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
            <input
              type="checkbox" checked={useTemplate} onChange={toggleTemplate}
              data-testid="broadcast-template"
            />
            📸 Brug salgstale-skabelonen (skærmbilleder + gul tilmeldingsblok)
          </label>
        )}

        <label style={{ fontSize: '0.8rem', color: 'var(--c-muted)' }}>
          Emne
          <input
            type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
            style={{ ...inputStyle, marginTop: '0.25rem' }} data-testid="broadcast-subject"
          />
        </label>

        {/* Platform: vælg FØRST spillet, så ligaen i det spil. */}
        {PLATFORM_MODE && (
          <label style={{ fontSize: '0.8rem', color: 'var(--c-muted)' }}>
            Spil
            <select
              value={gameId} onChange={(e) => onGameChange(e.target.value)}
              style={{ ...inputStyle, marginTop: '0.25rem' }} data-testid="broadcast-game"
            >
              <option value="">– vælg spil –</option>
              {(games ?? []).map((g) => (
                <option key={g.id} value={g.id}>{g.emoji ? `${g.emoji} ` : ''}{g.name}</option>
              ))}
            </select>
          </label>
        )}

        <label style={{ fontSize: '0.8rem', color: 'var(--c-muted)' }}>
          {useTemplate
            ? 'Invitér til liga (den gule knap i mailen bliver ligaens tilmeldingslink)'
            : 'Invitér til liga ([LINK] i teksten bliver til ligaens tilmeldingslink)'}
          <select
            value={leagueId} onChange={(e) => setLeagueId(e.target.value)}
            style={{ ...inputStyle, marginTop: '0.25rem' }} data-testid="broadcast-league"
            disabled={PLATFORM_MODE && !gameId}
          >
            <option value="">
              {PLATFORM_MODE && !gameId ? '– vælg spil først –' : leagueOptions.length === 0 ? '– ingen ligaer –' : '– vælg liga –'}
            </option>
            {leagueOptions.map((l) => (
              <option key={l.id} value={l.id}>{l.name} (kode: {l.code})</option>
            ))}
          </select>
          {joinLink && (
            <span style={{ display: 'block', marginTop: '0.25rem', fontSize: '0.78rem', wordBreak: 'break-all' }} data-testid="broadcast-join-link">
              Linket der flettes ind: {joinLink}
            </span>
          )}
          {needsLeague && (
            <span style={{ display: 'block', marginTop: '0.25rem', fontSize: '0.78rem', color: 'var(--c-warn)' }} data-testid="broadcast-needs-league">
              {useTemplate
                ? 'Vælg en liga — skabelonens gule knap skal pege på en liga-tilmelding.'
                : 'Teksten indeholder [LINK] — vælg en liga (eller fjern [LINK]) for at kunne sende.'}
            </span>
          )}
        </label>

        {/* 🏁 Tilbageblik: indsæt en gammel ligas slutstilling (top 5) i mailen.
            [TOP5]/[VINDER]/[LIGANAVN GAMMEL] i emne/besked erstattes; uden
            [TOP5] tilføjes blokken sidst i beskeden. */}
        {PLATFORM_MODE && legacy.length > 0 && (
          <label style={{ fontSize: '0.8rem', color: 'var(--c-muted)' }}>
            🏁 Tilbageblik: tidligere liga (indsætter slutstillingens top 5)
            <div className="flex" style={{ gap: '0.5rem', marginTop: '0.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={legacyId} onChange={(e) => { setLegacyId(e.target.value); setLegacyMsg(''); }}
                style={{ ...inputStyle, maxWidth: 340 }} data-testid="broadcast-legacy"
              >
                <option value="">– vælg tidligere liga –</option>
                {legacy.map((l) => (
                  <option key={l.id} value={l.id}>{l.sourceLabel}: {l.name} ({l.memberCount} spillere)</option>
                ))}
              </select>
              <button
                type="button" className="btn btn--ghost btn--sm"
                disabled={!selectedLegacy} onClick={insertLegacyTop5}
                data-testid="broadcast-legacy-insert"
              >
                📋 Indsæt top 5
              </button>
              {legacyMsg && <span className="badge badge--green">{legacyMsg}</span>}
            </div>
            {selectedLegacy && (
              <span style={{ display: 'block', marginTop: '0.25rem', fontSize: '0.78rem' }} data-testid="broadcast-legacy-preview">
                {selectedLegacy.top?.map((t) => `${t.rank}. ${t.name} (${t.points})`).join(' · ')}
              </span>
            )}
          </label>
        )}

        <label style={{ fontSize: '0.8rem', color: 'var(--c-muted)' }}>
          {useTemplate ? 'Personlig intro (står øverst i mailen — resten kommer fra skabelonen)' : 'Besked'}
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
