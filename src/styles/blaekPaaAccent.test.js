// ---------------------------------------------------------------------------
// HVIDT BLÆK OVEN PÅ EN ACCENT, DER KAN SKIFTE FARVE.
//
// `Layout.jsx` havde `background: var(--c-pitch)` og `color: '#fff'` ved siden
// af hinanden. Det er kun rigtigt, så længe accenten er MØRK — og accenten er
// netop ikke mørk længere: den følger klubfarven, og i mørkt tema er appens
// egen grønne gået fra #0b6e4f til #11a677. Hvid på den er 3,11:1, hvor den før
// var 6,25:1. Ændringen skubbede altså de steder fra bestået til dumpet, uden
// at nogen af dem stod i diffen.
//
// Jeg rettede Layout.jsx og troede, det var dét. Quality Control fandt to mere
// (UserRow, TeamPage), og da jeg gik efter dem, lå der to til i MessagesPage.
// Fire ud af fem fandtes ikke ved at kigge — de fandtes ved at søge. Så søger
// vi. Den her test er billigere end den femte gennemgang.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kontrast } from '../lib/contrastText';

const ROD = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function alleKildefiler(mappe = ROD, ud = []) {
  for (const navn of readdirSync(mappe)) {
    const sti = resolve(mappe, navn);
    if (statSync(sti).isDirectory()) alleKildefiler(sti, ud);
    else if (/\.jsx?$/.test(navn) && !/\.test\.jsx?$/.test(navn)) ud.push(sti);
  }
  return ud;
}

/** Hvidt skrevet ud i hånden — de skrivemåder, der faktisk optræder i koden. */
const HVID = /^'#(fff|ffffff|FFF|FFFFFF)'$/;

describe('blæk på --c-pitch som flade', () => {
  it('findes ikke som hardkodet hvid nogen steder i src/', () => {
    const fund = [];
    for (const sti of alleKildefiler()) {
      const linjer = readFileSync(sti, 'utf8').split('\n');
      linjer.forEach((linje, i) => {
        if (linje.trimStart().startsWith('//') || linje.trimStart().startsWith('*')) return;
        if (!linje.includes('var(--c-pitch)')) return;
        // Blækket kan stå på samme linje som fladen eller på en af de to
        // nærmeste — begge former optrådte i de fire, der blev fundet.
        const vindue = linjer.slice(Math.max(0, i - 2), i + 3).join(' ');
        const blaek = vindue.match(/color:\s*(?:[^,;}]*\?\s*)?('[^']*')/);
        if (blaek && HVID.test(blaek[1])) {
          fund.push(`${relative(ROD, sti)}:${i + 1}`);
        }
      });
    }
    expect(fund).toEqual([]);
  });

  it('og tallet, der gør det til en fejl, holder stadig', () => {
    // Hvid var god nok på den gamle mørke grønne og er det ikke på den nye.
    expect(kontrast('#ffffff', '#0b6e4f')).toBeCloseTo(6.25, 1);
    expect(kontrast('#ffffff', '#11a677')).toBeCloseTo(3.11, 1);
    // Blækket, temaet selv regner ud, klarer den.
    expect(kontrast('#10151b', '#11a677')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('appens grønne skrevet ud i tal', () => {
  it('står ikke længere som en svag tone nogen steder', () => {
    // Det er #0b6e4f skrevet i decimal. Syv steder brugte den som "en svag tone
    // af accenten" — hover-rækken i stillingen, egen-rækken, fokusringen på
    // felter, skyggen under en knap og de tippede rækker i Tour. Ingen af dem
    // fulgte temaet, så et rødt spil fik grønne rækker og en grøn glorie.
    //
    // DepGraph er undtaget med vilje: den tegner et diagram med sine egne
    // lag-farver og skal netop ikke følge et holdtema. Derfor står tonen dér i
    // kortform (.1), som ikke matcher.
    const fund = [];
    for (const sti of [resolve(ROD, 'styles/theme.css'), ...alleKildefiler()]) {
      if (/rgba\(11,\s*110,\s*79,\s*0\.\d/.test(readFileSync(sti, 'utf8'))) {
        fund.push(relative(ROD, sti));
      }
    }
    expect(fund).toEqual([]);
  });

  it('og de faste blandingsforhold under --c-pitch-blæk er væk', () => {
    // `.pick--selected` blandede 12 % accent i fladen med et tal valgt i øjemål.
    // Med Nottingham Forests rød gav det 3,66:1 på labelen — under kravet, på
    // det element der klikkes mest på. `--c-pitch-weak` er MÅLT.
    const css = readFileSync(resolve(ROD, 'styles/theme.css'), 'utf8');
    expect(css).not.toMatch(/color-mix\(in srgb, var\(--c-pitch\) 12%/);
    expect(css).toMatch(/\.pick--selected \{[^}]*background: var\(--c-pitch-weak\)/s);
  });
});
