// ---------------------------------------------------------------------------
// useRiderProfiles – live rytter-karakteristika fra config/riderProfiles.
//
// Dokumentet lægger sig OVEN PÅ den statiske rytter-fil (som er seed/fallback):
//   { riders: { "<bib>": { type?, tags: [string|{label,source}], notes? } },
//     aiRaw:  [ { rider, tag, stage, evidence, at } ],   // AI-udledt, navne-nøglet
//     enrichedStages: [n], updatedAt }
//
// Manuelle tags er bib-nøglede. AI-tags kommer navne-nøglede fra tickeren og
// slås her op mod startnummeret via riderInfo, så begge kan vises pr. rytter.
// Type-override (manuel) vinder over den statiske letour-profil.
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { riderInfo } from '../../data/ridersTdf2026';
import { canonTag } from '../../lib/riderTagCanon';

/** Normalisér et manuelt tag (streng eller objekt) til {label, source} (kanonisk). */
function normManualTag(t) {
  const raw = typeof t === 'string' ? t : (t && t.label);
  return { label: canonTag(raw), source: (t && t.source) || 'manual' };
}

export function useRiderProfiles() {
  const [docData, setDocData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = doc(db, 'config', 'riderProfiles');
    const unsub = onSnapshot(
      ref,
      (snap) => { setDocData(snap.exists() ? snap.data() : {}); setLoading(false); },
      () => { setDocData({}); setLoading(false); },
    );
    return unsub;
  }, []);

  const value = useMemo(() => {
    const riders = (docData && docData.riders) || {};
    const aiRaw = Array.isArray(docData && docData.aiRaw) ? docData.aiRaw : [];

    // AI-tags: slå rytternavn → startnummer op og saml pr. bib.
    const aiByBib = new Map();
    for (const t of aiRaw) {
      const info = riderInfo(t && t.rider);
      if (!info || info.bib == null) continue;
      const label = canonTag(t.tag);
      if (!label) continue;
      const arr = aiByBib.get(info.bib) || [];
      arr.push({ label, source: 'ai', evidence: t.evidence || '', stage: t.stage ?? null });
      aiByBib.set(info.bib, arr);
    }

    // Manuel type-override pr. bib.
    const typeOverrides = new Map();
    for (const [bib, p] of Object.entries(riders)) {
      if (p && p.type) typeOverrides.set(Number(bib), String(p.type));
    }

    // Alle tags for en rytter (manuel + AI), dedupliceret på label (manuel vinder).
    const tagsForBib = (bib) => {
      const manual = ((riders[bib] && riders[bib].tags) || []).map(normManualTag).filter((t) => t.label);
      const ai = aiByBib.get(Number(bib)) || [];
      const seen = new Set(manual.map((t) => t.label.toLowerCase()));
      const merged = manual.slice();
      for (const t of ai) {
        if (!t.label || seen.has(t.label.toLowerCase())) continue;
        seen.add(t.label.toLowerCase());
        merged.push(t);
      }
      return merged;
    };

    const notesForBib = (bib) => (riders[bib] && riders[bib].notes) || '';
    const typeForBib = (bib, fallback) => typeOverrides.get(Number(bib)) || fallback;

    // Tag → startnumre (til klikbare tag-filtre). Bygges fra alle ryttere der
    // har mindst ét tag (manuelt eller AI). allTags er unikke labels, sorteret.
    const tagToBibs = new Map();
    const taggedBibs = new Set([...Object.keys(riders).map(Number), ...aiByBib.keys()]);
    for (const bib of taggedBibs) {
      for (const t of tagsForBib(bib)) {
        const key = t.label.toLowerCase();
        if (!tagToBibs.has(key)) tagToBibs.set(key, { label: t.label, bibs: new Set() });
        tagToBibs.get(key).bibs.add(Number(bib));
      }
    }
    const allTags = [...tagToBibs.values()]
      .map((v) => ({ label: v.label, count: v.bibs.size }))
      .sort((a, b) => a.label.localeCompare(b.label, 'da'));
    const bibsForTag = (tag) => {
      const e = tagToBibs.get(String(tag || '').toLowerCase());
      return e ? [...e.bibs] : [];
    };

    return { riders, aiRaw, aiByBib, typeOverrides, tagsForBib, notesForBib, typeForBib, allTags, bibsForTag };
  }, [docData]);

  return { ...value, loading };
}
