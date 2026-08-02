// ---------------------------------------------------------------------------
// TeamNameAudit — admin-panel: fuld gennemgang af holdnavne i data.
// Finder alle navne i etape-tip + teams-kollektionen, viser status mod den
// officielle 2026-liste, og kan omdøbe forældede navne (remapTeamName-
// callablen retter alle tips, genberegner point og rydder dublet-docs).
// ---------------------------------------------------------------------------
import { useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import { COL } from '../../lib/constants';
import { TOUR_TEAMS } from '../../data/tourTeams2026';
import { auditTeamNames } from './teamNameAudit';

const STATUS_BADGE = {
  official: { cls: 'badge--green', label: '✓ officielt' },
  variant: { cls: 'badge--blue', label: '↦ variant (håndteres automatisk)' },
  unknown: { cls: 'badge--red', label: '⚠️ ukendt — bør omdøbes' },
};

export default function TeamNameAudit() {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [remapTo, setRemapTo] = useState({}); // name -> valgt officielt navn
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function runAudit() {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const [betsSnap, teamsSnap] = await Promise.all([
        getDocs(collection(db, COL.STAGE_BETS)),
        getDocs(collection(db, COL.TEAMS)),
      ]);
      setRows(auditTeamNames(
        betsSnap.docs.map((d) => d.data()),
        teamsSnap.docs.map((d) => d.data()),
        TOUR_TEAMS,
      ));
    } catch (e) {
      console.error('Holdnavne-gennemgang fejlede:', e);
      setError('Kunne ikke hente data til gennemgangen.');
    } finally {
      setBusy(false);
    }
  }

  async function remap(name) {
    const to = remapTo[name];
    if (!to) return;
    if (!window.confirm(`Omdøb "${name}" til "${to}" i ALLE tips? Point genberegnes.`)) return;
    await runRemap({ from: name, to }, `✓ "${name}" → "${to}"`);
  }

  // Nedlagt hold uden efterfølger: felterne tømmes, så tippet fremstår
  // uspillet — på åbne etaper kan spilleren tippe forfra.
  async function clearName(name) {
    if (!window.confirm(
      `Ryd ALLE tips på "${name}"? Felterne tømmes (fremstår uspillet), og point genberegnes. `
      + 'Spillere kan gen-tippe på åbne etaper.',
    )) return;
    await runRemap({ from: name, clear: true }, `✓ Tips på "${name}" ryddet`);
  }

  async function runRemap(payload, prefix) {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const fn = httpsCallable(functions, 'remapTeamName');
      const res = await fn(payload);
      const { changed, players } = res.data || {};
      setMsg(`${prefix}: ${changed} tip rettet hos ${players} spillere.`);
      await runAudit(); // vis den friske tilstand
    } catch (e) {
      console.error('Holdnavne-rettelse fejlede:', e);
      setError(e?.message || 'Rettelsen fejlede.');
    } finally {
      setBusy(false);
    }
  }

  const unknowns = (rows || []).filter((r) => r.status === 'unknown');

  return (
    <div className="card" data-testid="team-name-audit" style={{ marginTop: '1rem' }}>
      <h3 style={{ margin: '0 0 0.35rem' }}>🔎 Holdnavne-gennemgang</h3>
      <p style={{ fontSize: '0.82rem', color: 'var(--c-muted)', margin: '0 0 0.6rem' }}>
        Finder alle holdnavne i spillernes tips og holdlisten, og sammenligner med de
        officielle 2026-navne. Forældede navne (fx fra sidste års holdliste) kan omdøbes
        her — alle tips rettes, point genberegnes, og dubletter ryddes.
      </p>
      <button type="button" className="btn btn--sm" onClick={runAudit} disabled={busy} data-testid="run-audit">
        {busy ? 'Arbejder…' : (rows ? 'Kør gennemgangen igen' : 'Kør gennemgang')}
      </button>

      {msg && <p style={{ color: 'var(--c-ok)', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>{msg}</p>}
      {error && <p style={{ color: 'var(--c-err)', fontSize: '0.85rem', margin: '0.5rem 0 0' }} role="alert">{error}</p>}

      {rows && (
        <div style={{ marginTop: '0.75rem' }}>
          {unknowns.length === 0 && (
            <p style={{ color: 'var(--c-ok)', fontSize: '0.88rem', fontWeight: 600 }}>
              ✓ Ingen ukendte holdnavne — alle {rows.length} navne i data matcher den officielle liste.
            </p>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: '0.84rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Navn i data</th>
                  <th style={{ textAlign: 'right' }} title="Antal tip-felter med navnet">Tips</th>
                  <th style={{ textAlign: 'left' }}>Status</th>
                  <th style={{ textAlign: 'left' }}>Handling</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name} data-testid={`audit-${r.status}`}>
                    <td style={{ fontWeight: 600 }}>
                      {r.name}
                      {r.inTeamsCol && <span title="Findes også i teams-kollektionen" style={{ marginLeft: 4 }}>🗂️</span>}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.count}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[r.status].cls}`} style={{ fontSize: '0.7rem' }}>
                        {STATUS_BADGE[r.status].label}
                      </span>
                      {r.status === 'variant' && r.official && (
                        <span style={{ fontSize: '0.76rem', color: 'var(--c-muted)', marginLeft: 6 }}>→ {r.official}</span>
                      )}
                    </td>
                    <td>
                      {r.status === 'unknown' && (
                        <span style={{ display: 'inline-flex', gap: '0.3rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          <select
                            value={remapTo[r.name] || ''}
                            onChange={(e) => setRemapTo((m) => ({ ...m, [r.name]: e.target.value }))}
                            style={{ padding: '0.25rem 0.4rem', borderRadius: 6, border: '1px solid var(--c-border)', fontSize: '0.8rem' }}
                            data-testid={`remap-select-${r.name}`}
                          >
                            <option value="">– omdøb til –</option>
                            {TOUR_TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <button
                            type="button"
                            className="btn btn--sm"
                            disabled={busy || !remapTo[r.name]}
                            onClick={() => remap(r.name)}
                            data-testid={`remap-run-${r.name}`}
                          >
                            Omdøb
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            disabled={busy}
                            onClick={() => clearName(r.name)}
                            title="Nedlagt hold uden efterfølger: tøm felterne, så tippet fremstår uspillet"
                            data-testid={`clear-run-${r.name}`}
                          >
                            Ryd tips
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
