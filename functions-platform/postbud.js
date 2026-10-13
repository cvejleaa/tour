// ---------------------------------------------------------------------------
// functions-platform/postbud.js — alarm-postbudet: det, der gør Driftstatus
// til PUSH i stedet for pull.
//
// Før dette modul nåede en alarm kun ejeren, når han selv åbnede Admin →
// 🩺 Driftstatus, og en kørsel, der var holdt op med at køre, lyste kun rødt
// på en fane, ingen kiggede på. Postbudet kører hvert kvarter og gør to ting:
//
//   1. KØRSLER: læser driftlog-kortene og melder en alarm (`koersel`) for hvert
//      kort, der er forsinket (serverens egen naesteForventetFoer er passeret —
//      SAMME prædikat som StatusKort i DriftTab.jsx) eller står på niveau 'fejl'.
//      Alarmen lukkes igen, når kortet er grønt (loesAlarmerAfType). Uden
//      dette ville det vigtigste signal — "skemaet er holdt op" — stadig kun
//      kunne ses ved at logge ind (QC på planen, B1).
//   2. MAIL: samler alle ÅBNE alarmer, der ikke er mailet (`mailetAt == null`),
//      i ÉN mail til alle godkendte owner/globalAdmin og sætter `mailetAt`.
//
// Hvorfor et PLANLAGT postbud og ikke en trigger pr. alarm-dokument: et
// kilde-nedbrud kan åbne ~180 strandede alarmer på én gang (driftlog.js,
// dæmpningen) — det skal blive til én mail, ikke 180.
//
// Hvorfor adressen hentes fra Auth-kontoen og ikke userContacts: userContacts
// kan kontohaveren selv skrive frit og uverificeret (Security på planen, F7);
// Auth-adressen ændres kun af ejeren (adminSetUserEmail). Et manglende felt
// er ingen modtager — og NUL modtagere er en driftlog-FEJL, aldrig et tavst ok.
//
// Mailen er FAST HTML: ingen markdown, ingen auto-linkning af URL'er i
// alarm-tekster (Security F6 — en alarm-tekst må aldrig kunne blive et
// klikbart link i ejerens indbakke). Alt indhold escapes; URL'er i tekster
// erstattes af [url]; det eneste link er det faste til Driftstatus.
//
// Modulet er frit for firebase-imports (db/FieldValue/auth/transporter
// injiceres), så det kan testes rent — index.js kan ikke.
// ---------------------------------------------------------------------------
const { escapeHtml, sendEmail, APP_URL } = require('./mailer');
const { meldAlarm, loesAlarmerAfType, alarmTitel, alarmHast } = require('./driftlog');
const { SYNCED_GAMES } = require('./syncProviders');

/** Typen i emailLog — får dansk label i EmailLogTab.jsx (TYPE_LABELS). */
const MAIL_TYPE = 'drift-alarm';
/** Linket i mailen: AdminPage læser ?fane=drift (hvidliste; ukendt → Brugere). */
const DRIFT_URL = `${APP_URL}/admin?fane=drift`;
/** Højst så mange linjer i én mail — resten står som "… og N flere". */
const MAKS_LINJER = 20;
/** Flere end så mange ens alarmer (samme type, samme spil) samles i én linje. */
const SAMLE_GRAENSE = 3;
/** Alarm-tekster afkortes hertil i mailen (Security: ingen stakke, ingen romaner). */
const BESKED_MAKS = 300;
const TZ = 'Europe/Copenhagen';

/**
 * Kørslernes danske navne — SPEJL af TYPE_NAVN i src/features/admin/DriftTab.jsx.
 * Klienten kan ikke importere serverens moduler, så spejlet er bundet med en
 * paritetstest i postbud.test.js, der læser DriftTab.jsx (mønstret fra
 * mailMarkdown). Et navn, der kun findes det ene sted, gør testen rød.
 */
const KOERSEL_NAVN = {
  sweep: 'Times-sweep (facit + tabel)',
  minut: 'Minut-synk (kampdage)',
  livemaal: 'Live-mål (kampe i gang)',
  kickoff: 'Daglig kickoff-synk',
  reminder: 'Daglig tip-påmindelse',
  postbud: 'Alarm-mail (hvert 15. min)',
};

/** Rækkefølgen og overskrifterne i mailen — hast fra driftlog.js' ALARM_TYPER. */
const HAST_ORDEN = [
  ['haster', 'Haster — før næste kampstart'],
  ['idag', 'Kan vente til i dag'],
  ['udvikler', 'Til udvikleren — intet du skal gøre'],
  ['andet', 'Andet'],
  ['test', 'Test'],
];
/** Hast-ordet forrest i emnet (Spilfører), så indbakken kan sorteres på det. */
const HAST_ORD = { haster: 'Haster', idag: 'I dag', udvikler: 'Til udvikleren', andet: 'Andet', test: 'Test' };
/** Kort-typer, der kun findes for spil i SYNCED_GAMES — et kort for et spil, der er taget ud, er forældreløst. */
const SYNKEDE_KORT = new Set(['sweep', 'minut', 'livemaal', 'kickoff']);
/** Postbudets egne alarm-typer — dem, der IKKE tæller som «en specifik alarm for spillet». */
const GENERISKE_TYPER = new Set(['koersel', 'koerselFejl', 'postbud', 'test']);
/** Ti minutter mellem test-alarmer pr. administrator (Security F8). */
const TEST_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Afkort en alarm-tekst til mailen: URL'er → [url] (ingen auto-linkning, ingen
 * fremmede links i indbakken), al whitespace → ét mellemrum, og en hård grænse.
 */
/**
 * Alt, en mail-klient kunne finde på at gøre klikbart (Security på koden):
 * http(s)-adresser, www.-adresser, domæner med tre led (api.superliga.dk,
 * tip.vejleaa.dk.evil.com/x) og to-leds-domæner på de almindelige endelser.
 * «kampDetaljer.js» og «v1.22.0» rammes ikke (to led uden kendt endelse;
 * sidste led skal være bogstaver).
 */
const URL_MOENSTER = /https?:\/\/\S+|\bwww\.\S+|\b[\w-]+(?:\.[\w-]+)+\.[a-z]{2,}(?:\/\S*)?|\b[\w-]+\.(?:dk|com|net|org|io|app|de|se|no|uk|eu|info|nu)\b(?:\/\S*)?/gi;

function afkort(s, maks = BESKED_MAKS) {
  const ren = String(s == null ? '' : s)
    .replace(URL_MOENSTER, '[url]')
    .replace(/\s+/g, ' ')
    .trim();
  return ren.length > maks ? `${ren.slice(0, maks - 1)}…` : ren;
}

/** «man. 13.10. 11.02» — dansk, i Københavns tid; tom streng for et ugyldigt tal. */
function datoDa(ms) {
  if (!Number.isFinite(ms)) return '';
  return new Intl.DateTimeFormat('da-DK', {
    timeZone: TZ, weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(ms);
}

/** Åbne alarmer, der ikke er mailet. Et MANGLENDE felt tæller som umailet. */
function umailede(alarmer) {
  return (alarmer || []).filter((a) => a.loestAt == null && a.mailetAt == null);
}

/**
 * Er et driftlog-kort rødt? Forsinket afgøres af serverens EGEN
 * naesteForventetFoer — klienten gætter aldrig kadencen, og det gør
 * postbudet heller ikke. SAMME prædikat som StatusKort i DriftTab.jsx.
 */
function erRoedtKort(k, nowMs) {
  const forsinket = k.naesteForventetFoer != null && nowMs > k.naesteForventetFoer;
  return forsinket || k.niveau === 'fejl';
}

/** Er kortet forsinket? Serverens egen frist — aldrig en gættet kadence. */
function erForsinket(k, nowMs) {
  return k.naesteForventetFoer != null && nowMs > k.naesteForventetFoer;
}

/** Teksten på en kørsels-alarm — hvad der er ramt, og hvad ejeren kan gøre. */
function koerselBesked(k, nowMs) {
  const navn = `${KOERSEL_NAVN[k.type] || k.type} for ${k.gameNavn || k.gameId || 'platformen'}`;
  if (erForsinket(k, nowMs)) {
    return `${navn} har ikke kørt til tiden — sidst kørt ${k.koertAt ? datoDa(k.koertAt) : 'aldrig'}. `
      + 'Står den stadig rød ved næste kvarter, er skemaet holdt op med at køre: send denne mail til udvikleren.';
  }
  return `${navn} fejlede: ${afkort(k.besked, 200)} — kortet på Admin → 🩺 Driftstatus har detaljerne.`;
}

/**
 * Et kort for et spil, der ikke længere synkes (taget ud af SYNCED_GAMES), er
 * FORÆLDRELØST: dets frist er passeret for evigt, og det ville give en
 * alarm, der aldrig lukker (Security på koden). Fladen viser det heller ikke
 * som forventet kørsel. Påmindelses-kortet lukker sig selv (frist null) og
 * er ikke omfattet. Udskilt, så reglen kan testes.
 */
function erForaeldreloest(k, synkedeSpil) {
  return SYNKEDE_KORT.has(k.type) && !!k.gameId && !synkedeSpil.has(k.gameId);
}

/**
 * Kørsels-vagten: røde kort → alarmer; grønne kort lukker deres alarm igen.
 * To slags (QC på koden):
 *   forsinket → `koersel` med kvitteringskrav: en død scheduler må nage.
 *   fejl      → `koerselFejl` UDEN kvitteringskrav og kun når der ikke
 *               allerede er en åben, specifik alarm for samme spil — sweep-
 *               og kickoff-kortet bliver netop rødt, når en strandet/mangler/
 *               detaljer-alarm rejses, og den skal ikke stå to gange i mailen.
 *               Uden kvittering kan den heller ikke genåbnes hvert 6. time af
 *               en kvittering, mens en permanent tilstand (afbrudt kamp)
 *               består.
 * Postbudets eget kort springes over — er postbudet i stykker, kører denne
 * kode ikke, og en alarm, kun postbudet kan maile, er ingen alarm.
 */
async function roedeKortTilAlarmer(db, FieldValue, nowMs, aabneAlarmer, synkedeSpil) {
  const snap = await db.collection('driftlog').get();
  const kort = snap.docs.map((d) => ({ ...d.data(), id: d.id }))
    .filter((k) => k.type !== 'postbud' && !erForaeldreloest(k, synkedeSpil));
  const spilMedSpecifikAlarm = new Set(
    (aabneAlarmer || []).filter((a) => !GENERISKE_TYPER.has(a.type) && a.gameId).map((a) => a.gameId),
  );
  const forsinkede = kort.filter((k) => erForsinket(k, nowMs));
  const fejlede = kort.filter((k) => !erForsinket(k, nowMs) && k.niveau === 'fejl');
  for (const k of forsinkede) {
    await meldAlarm(db, FieldValue, {
      type: 'koersel', gameId: k.gameId ?? null, kampId: k.id,
      besked: koerselBesked(k, nowMs), kraeverKvittering: true, nowMs,
    });
  }
  let dubletter = 0;
  for (const k of fejlede) {
    if (k.gameId && spilMedSpecifikAlarm.has(k.gameId)) { dubletter += 1; continue; }
    await meldAlarm(db, FieldValue, {
      type: 'koerselFejl', gameId: k.gameId ?? null, kampId: k.id,
      besked: koerselBesked(k, nowMs), kraeverKvittering: false, nowMs,
    });
  }
  const a = await loesAlarmerAfType(db, FieldValue, { type: 'koersel', aktuelleKampIds: forsinkede.map((k) => k.id), nowMs });
  const b = await loesAlarmerAfType(db, FieldValue, { type: 'koerselFejl', aktuelleKampIds: fejlede.map((k) => k.id), nowMs });
  return { roede: forsinkede.length + fejlede.length, lukket: a.lukket + b.lukket, dubletter };
}

/** Må administratoren sende en test-alarm nu? Ren, så 10-minutters-grænsen kan testes. */
function testAlarmTilladt(cur, nowMs) {
  return !cur || nowMs - (cur.sidstSetAt || 0) >= TEST_INTERVAL_MS;
}

/**
 * Modtagerne: godkendte brugere med role owner/globalAdmin — adressen fra
 * Auth-kontoen (ikke userContacts, se filens hoved). En bruger uden
 * Auth-konto eller uden adresse springes over med en log-linje.
 */
async function adminModtagere(db, auth) {
  const snap = await db.collection('users').where('role', 'in', ['owner', 'globalAdmin']).get();
  const ud = [];
  for (const d of snap.docs) {
    const u = d.data() || {};
    if (u.status !== 'approved') continue;
    try {
      const rec = await auth.getUser(d.id);
      if (rec && rec.email) ud.push({ uid: d.id, email: rec.email, navn: u.displayName || rec.email });
    } catch (e) {
      console.warn(`postbud: ingen Auth-konto for ${d.id}:`, e?.message || e);
    }
  }
  return ud;
}

/** gameId → spillets navn, for de spil alarmerne nævner. Ukendt spil → id'et. */
async function hentSpilNavne(db, alarmer) {
  const ids = [...new Set(alarmer.map((a) => a.gameId).filter(Boolean))];
  const ud = {};
  for (const id of ids) {
    try {
      const s = await db.collection('games').doc(id).get();
      ud[id] = (s.exists && s.data()?.name) || id;
    } catch {
      ud[id] = id;
    }
  }
  return ud;
}

/** Linjerne i mailen: (type, spil) grupperes; flere end SAMLE_GRAENSE ens → én linje. */
function linjer(alarmer, spilNavne) {
  const grupper = new Map();
  for (const a of alarmer) {
    const k = `${a.type}|${a.gameId || ''}`;
    if (!grupper.has(k)) grupper.set(k, []);
    grupper.get(k).push(a);
  }
  const ud = [];
  for (const g of grupper.values()) {
    const a = g[0];
    const spil = a.gameId ? (spilNavne[a.gameId] || a.gameId) : 'Platformen';
    const titel = a.titel || alarmTitel(a.type);
    if (g.length > SAMLE_GRAENSE) {
      const foerste = g.map((x) => x.foersteSetAt).filter(Number.isFinite).sort((x, y) => x - y)[0];
      // Hvilke — ikke kun hvor mange (QC): de første fem kamp-/kort-id'er.
      // ALDRIG for test-alarmer: deres kampId er administratorens uid, og en
      // uid hører ikke hjemme i en mail (TM-fund på den samlede linje).
      const ider = a.type === 'test' ? [] : g.map((x) => x.kampId).filter(Boolean);
      const hvilke = ider.length
        ? ` Gælder: ${ider.slice(0, 5).map(escapeHtml).join(', ')}${ider.length > 5 ? ` (+${ider.length - 5})` : ''}.`
        : '';
      ud.push({
        hast: alarmHast(a.type),
        titel: `${g.length} × ${titel}`,
        spil,
        html: `<strong>${escapeHtml(spil)} — ${g.length} × ${escapeHtml(titel)}</strong><br>`
          + `${escapeHtml(afkort(a.besked))}${hvilke}<br>`
          + `<small>Første set ${escapeHtml(datoDa(foerste))} · ${g.length} alarmer — se Driftstatus for hver enkelt</small>`,
      });
      continue;
    }
    for (const x of g) {
      const t = x.titel || alarmTitel(x.type);
      const kvit = x.kraeverKvittering ? (x.kvitteretAt ? ' · allerede kvitteret' : ' · skal kvitteres') : '';
      ud.push({
        hast: alarmHast(x.type),
        titel: t,
        spil,
        html: `<strong>${escapeHtml(spil)} — ${escapeHtml(t)}</strong><br>`
          + `${escapeHtml(afkort(x.besked))}<br>`
          + `<small>Set første gang ${escapeHtml(datoDa(x.foersteSetAt))}${x.antal > 1 ? ` · ${x.antal} gange` : ''}${kvit}</small>`,
      });
    }
  }
  return ud;
}

/**
 * Emne og krop for én alarm-mail. Ren funktion — det er HER indholdet testes,
 * også det, der IKKE må stå (uid'er, rå HTML, links fra alarm-tekster).
 * @returns {{subject:string, html:string, linjer:number}}
 */
function alarmMail(alarmer, { spilNavne = {} } = {}) {
  const alle = linjer(alarmer, spilNavne);
  const kunTest = alle.length > 0 && alarmer.every((a) => a.type === 'test');
  const haster = alle.filter((l) => l.hast === 'haster').length;
  const n = alle.length;
  // Hast-ordet står FORREST i emnet, hver gang (Spilfører + QC): den enkelte
  // alarm, der haster, skal kunne skilles ud i indbakken — ikke kun bunker.
  // Ved flere alarmer bruges den mest hastende gruppe.
  const mest = HAST_ORDEN.map(([h]) => h).find((h) => alle.some((l) => l.hast === h)) || 'andet';
  let subject;
  if (kunTest) {
    subject = 'Vejleaa Tip – TEST-alarm: alarm-mailen virker';
  } else if (n === 1) {
    subject = `Vejleaa Tip · ${HAST_ORD[mest]}: ${alle[0].titel}${alle[0].spil !== 'Platformen' ? ` (${alle[0].spil})` : ''}`;
  } else {
    subject = `Vejleaa Tip · ${HAST_ORD[mest]}: ${n} driftalarmer${haster ? ` (${haster} haster)` : ''}`;
  }
  let html = '<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#222">';
  // «du ikke har fået mail om før» — sandt også for baseline-mailen efter en
  // udrulning (QC: «siden sidste mail» var forkert for den første).
  html += kunTest
    ? '<p>Dette er en test af alarm-mailen — der er intet at gøre ud over at kvittere test-alarmen på Driftstatus.</p>'
    : `<p>Driftvagten har fundet ${n === 1 ? '1 ting' : `${n} ting`}, du ikke har fået mail om før.</p>`;
  let vist = 0;
  for (const [hast, overskrift] of HAST_ORDEN) {
    const del = alle.filter((l) => l.hast === hast);
    if (!del.length || vist >= MAKS_LINJER) continue;
    html += `<p><strong>${overskrift}</strong></p><ul>`;
    for (const l of del) {
      if (vist >= MAKS_LINJER) break;
      html += `<li>${l.html}</li>`;
      vist += 1;
    }
    html += '</ul>';
  }
  if (alle.length > vist) html += `<p>… og ${alle.length - vist} flere — se Driftstatus.</p>`;
  // ProtectedRoute taber målet ved login (sender til forsiden) — sig det ærligt.
  html += `<p><a href="${DRIFT_URL}">Åbn Driftstatus</a> — er du ikke logget ind, så log ind og tryk på linket igen.</p>`;
  html += '<p style="color:#888;font-size:12px">Løser en alarm sig selv, forsvinder den fra Driftstatus — du får ingen mail om det.<br>'
    + 'Du får denne mail, fordi du er administrator på Vejleaa Tip.</p></div>';
  return { subject, html, linjer: n };
}

/** Teksten på test-alarmen — navn, ikke uid (uid'er hører ikke hjemme i en mail). */
function testAlarmBesked(navn, nowMs) {
  return `Test-alarm udløst af ${navn || 'en administrator'} ${datoDa(nowMs)} — ingen handling nødvendig. `
    + 'Kvittér den, når mailen er kommet; så forsvinder den.';
}

/**
 * Én kørsel af postbudet. Returnerer en status-linje som
 * koerPaamindelserForSpil, så index.js kan skrive driftlog-kortet med
 * `st[niveau](besked, tal)`.
 *
 * MINDST-ÉN-GANG-LEVERING: `mailetAt` sættes KUN, når mindst én modtager fik
 * mailen. Kaster batchen efter afsendelse, kommer mailen igen næste kvarter —
 * en dobbelt mail er den rigtige retning at fejle i. Og den sættes, selv om
 * én af to adresser bouncer: ellers mailes den fungerende adresse hvert
 * kvarter for evigt, fordi den anden ikke virker.
 *
 * Postbudet opgiver ALDRIG tavst (QC på planen): SMTP, der mangler, ingen
 * modtagere og en afsendelse, der fejler for alle, er tre forskellige FEJL
 * på kortet OG hver sin `postbud`-alarm, så badget lyser — det er det eneste,
 * postbudet selv kan gøre, når det ikke kan maile. Den eksterne vagt
 * (Cloud Monitoring, docs/drift.md) er den kanal, der ikke afhænger af os.
 */
async function koerPostbud(db, FieldValue, { transporter, auth, nowMs = Date.now(), synkedeSpil = null } = {}) {
  const synkede = synkedeSpil || new Set(SYNCED_GAMES.map((g) => g.gameId));
  // Alarmerne læses FØR kørsels-vagten: den skal vide, hvilke spil der
  // allerede har en specifik alarm — og vagten må ikke kunne koste mailen.
  // Kaster den (ét forkert kort), bliver det en ADVARSEL på kortet, og
  // mailen går ud alligevel (QC på koden).
  const foer = await db.collection('driftAlarmer').where('loestAt', '==', null).get();
  const aabneFoer = foer.docs.map((d) => ({ ...d.data(), id: d.id }));
  let kort = { roede: 0, lukket: 0, dubletter: 0 };
  let vagtFejl = '';
  try {
    kort = await roedeKortTilAlarmer(db, FieldValue, nowMs, aabneFoer, synkede);
  } catch (e) {
    vagtFejl = String(e?.message || e).slice(0, 200);
    console.error('postbud: kørsels-vagten fejlede (fortsætter til mailen):', vagtFejl);
  }
  const snap = await db.collection('driftAlarmer').where('loestAt', '==', null).get();
  const aabne = snap.docs.map((d) => ({ ...d.data(), id: d.id, _ref: d.ref }));
  const nye = umailede(aabne);
  const tal = { roedeKort: kort.roede, aabne: aabne.length, umailede: nye.length };
  const medVagt = (linje) => (vagtFejl
    ? { ...linje, niveau: linje.niveau === 'fejl' ? 'fejl' : 'advarsel', besked: `${linje.besked} ⚠ Kørsels-vagten fejlede: ${vagtFejl}` }
    : linje);

  if (!nye.length) {
    return medVagt({
      niveau: 'ok',
      besked: `Ingen nye alarmer at maile (${aabne.length} ${aabne.length === 1 ? 'åben' : 'åbne'}, alle mailet).`,
      tal: { ...tal, sendt: 0 },
    });
  }
  if (!transporter) {
    await meldAlarm(db, FieldValue, {
      type: 'postbud', gameId: null, kampId: 'smtp', kraeverKvittering: true, nowMs,
      besked: 'SMTP_PASSWORD er ikke sat — alarm-mails kan ikke sendes. Sæt secret\'en (docs/drift.md) og deploy functions.',
    });
    return medVagt({ niveau: 'fejl', besked: `SMTP_PASSWORD mangler — ${antalAlarmer(nye.length)} kunne ikke mailes.`, tal: { ...tal, sendt: 0 } });
  }
  const modtagere = await adminModtagere(db, auth);
  if (!modtagere.length) {
    await meldAlarm(db, FieldValue, {
      type: 'postbud', gameId: null, kampId: 'modtagere', kraeverKvittering: true, nowMs,
      besked: 'Ingen godkendt owner/globalAdmin har en e-mailadresse på sin Auth-konto — alarm-mails har ingen modtager.',
    });
    return medVagt({ niveau: 'fejl', besked: `Ingen modtager med e-mail — ${antalAlarmer(nye.length)} kunne ikke mailes.`, tal: { ...tal, sendt: 0 } });
  }

  const spilNavne = await hentSpilNavne(db, nye);
  const { subject, html } = alarmMail(nye, { spilNavne });
  let sendt = 0;
  let fejlede = 0;
  for (const m of modtagere) {
    try {
      await sendEmail(db, transporter, { to: m.email, subject, html, type: MAIL_TYPE });
      sendt += 1;
    } catch (e) {
      fejlede += 1;
      console.error(`postbud: mail til ${m.uid} fejlede:`, e?.message || e);
    }
  }
  if (!sendt) {
    await meldAlarm(db, FieldValue, {
      type: 'postbud', gameId: null, kampId: 'afsendelse', kraeverKvittering: true, nowMs,
      besked: `Afsendelsen fejlede for alle ${modtagere.length} modtagere — se Admin → ✉️ Mail-log. Der prøves igen hvert kvarter.`,
    });
    return medVagt({
      niveau: 'fejl',
      besked: `Afsendelse fejlede til alle ${modtagere.length} modtagere — ${antalAlarmer(nye.length)} prøves igen.`,
      tal: { ...tal, sendt, fejlede },
    });
  }

  // Kendt, lille løbsvindue (QC): genåbner sweep'et en alarm MELLEM læsningen
  // ovenfor og denne skrivning, overskrives dens nye mailetAt: null — og den
  // genåbning mailes ikke. Sandsynligheden er et par sekunder i kvarteret;
  // prisen for en transaktion pr. alarm står ikke mål med den. Og to
  // OVERLAPPENDE kørsler (skemaet + et klik i samme sekund) kan give samme
  // mail to gange (Security) — en dobbelt mail er den rigtige retning at
  // fejle i.
  const batch = db.batch();
  for (const a of nye) batch.set(a._ref, { mailetAt: nowMs }, { merge: true });
  await batch.commit();
  // Mailen kom ud → postbudets egne alarmer (smtp/modtagere/afsendelse) er løst.
  await loesAlarmerAfType(db, FieldValue, { type: 'postbud', aktuelleKampIds: [], nowMs });

  const besked = `Sendt til ${sendt} modtager${sendt === 1 ? '' : 'e'} (${antalAlarmer(nye.length)}).`;
  if (fejlede) {
    return medVagt({
      niveau: 'advarsel',
      besked: `${besked} ${fejlede} modtager${fejlede === 1 ? '' : 'e'} fejlede — se Mail-log.`,
      tal: { ...tal, sendt, fejlede },
    });
  }
  return medVagt({ niveau: 'ok', besked, tal: { ...tal, sendt, fejlede: 0 } });
}

/** «1 alarm» / «3 alarmer» — dansk tal, ikke «1 alarmer» (QC). */
function antalAlarmer(n) {
  return `${n} alarm${n === 1 ? '' : 'er'}`;
}

module.exports = {
  koerPostbud, alarmMail, umailede, erRoedtKort, erForsinket, erForaeldreloest, koerselBesked, afkort, datoDa,
  adminModtagere, testAlarmBesked, testAlarmTilladt, KOERSEL_NAVN, MAIL_TYPE, DRIFT_URL, MAKS_LINJER, SAMLE_GRAENSE,
  TEST_INTERVAL_MS,
};
