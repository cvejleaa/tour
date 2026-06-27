// ---------------------------------------------------------------------------
// functions/tourTeams.js — hold-identitet + tolerant matchning (CommonJS).
// SPEJL af src/lib/tourTeams.js — hold dem identiske!
// ---------------------------------------------------------------------------

function normalizeTeam(name) {
  return String(name == null ? '' : name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function teamKeyFromRow(row) {
  const url = row && row.team_url;
  if (url) {
    const slug = String(url).split('/').pop() || '';
    const noYear = slug.replace(/-\d{4}$/, '');
    if (noYear) return noYear;
  }
  const name = row && row.team_name;
  return name ? normalizeTeam(name) : null;
}

function sameTeam(a, b) {
  if (a == null || b == null) return false;
  return normalizeTeam(a) === normalizeTeam(b);
}

function findKnownTeam(name, known) {
  const n = normalizeTeam(name);
  if (!n) return null;
  for (const t of known || []) {
    if (normalizeTeam(t.name) === n || (t.key && normalizeTeam(t.key) === n)) return t;
  }
  return null;
}

function teamsFromRows(rows) {
  const byKey = new Map();
  for (const r of rows || []) {
    if (!r || !r.team_name) continue;
    const key = teamKeyFromRow(r);
    if (key && !byKey.has(key)) byKey.set(key, { key, name: r.team_name });
  }
  return [...byKey.values()];
}

module.exports = {
  normalizeTeam,
  teamKeyFromRow,
  sameTeam,
  findKnownTeam,
  teamsFromRows,
};
