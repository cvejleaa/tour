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

// ALIAS-tabel: samme hold under FORSKELLIGE navne i letours egne kilder
// (holdliste: "Netcompany Ineos"; resultattabeller: "INEOS GRENADIERS").
// Normalisering kan ikke bygge bro over et sponsorskifte — kendte varianter
// mappes eksplicit. Nøgler/værdier er normalizeTeam-nøgler. Spejl af src!
const TEAM_ALIASES = {
  ineosgrenadiers: 'netcompanyineos',
  netcompanyineoscyclingteam: 'netcompanyineos',
};

function canonicalTeamKey(name) {
  const key = normalizeTeam(name);
  return TEAM_ALIASES[key] || key;
}

function teamKeyFromRow(row) {
  const url = row && row.team_url;
  if (url) {
    const slug = String(url).split('/').pop() || '';
    const noYear = slug.replace(/-\d{4}$/, '');
    // Alias-opslag også på slug'en, så et hold aldrig får to nøgler
    // fordi kilderne bruger forskellige navne/slugs.
    if (noYear) return TEAM_ALIASES[normalizeTeam(noYear)] || noYear;
  }
  const name = row && row.team_name;
  return name ? canonicalTeamKey(name) : null;
}

function sameTeam(a, b) {
  if (a == null || b == null) return false;
  return canonicalTeamKey(a) === canonicalTeamKey(b);
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
  canonicalTeamKey,
  TEAM_ALIASES,
  teamKeyFromRow,
  sameTeam,
  findKnownTeam,
  teamsFromRows,
};
