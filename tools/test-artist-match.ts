#!/usr/bin/env node
// Smoke test for the artist-match logic in fetch-lyrics.ts.
// Verifies the fix for the "Meant to Be vs The Middle" duplicate-lyrics bug.

interface Case {
  found: string;
  expected: string;
  shouldMatch: boolean;
}

const CASES: Case[] = [
  // The bug
  { found: "Bebe Rexha", expected: "Bebe Rexha", shouldMatch: true },
  { found: "Zedd, Maren Morris & Grey", expected: "Zedd", shouldMatch: true },
  { found: "Zedd", expected: "Zedd", shouldMatch: true },
  // Featuring cases
  { found: "Bebe Rexha featuring Florida Georgia Line", expected: "Bebe Rexha", shouldMatch: true },
  { found: "Drake feat. Lil Baby", expected: "Drake", shouldMatch: true },
  { found: "Lady Gaga & Bradley Cooper", expected: "Lady Gaga", shouldMatch: true },
  // Substring matches (legitimate)
  { found: "The Weeknd", expected: "The Weeknd", shouldMatch: true },
  { found: "Aubrey Drake Graham", expected: "Drake", shouldMatch: true },
  // Mismatches
  { found: "Bebe Rexha", expected: "Zedd", shouldMatch: false },
  { found: "Drake", expected: "The Weeknd", shouldMatch: false },
  { found: "Benny Blanco, Halsey and Khalid", expected: "Bebe Rexha", shouldMatch: false },
  // Edge cases
  { found: "", expected: "Drake", shouldMatch: false },
  { found: "Drake", expected: "", shouldMatch: false },
  { found: "D", expected: "Drake", shouldMatch: false }, // too short
  { found: "Drake", expected: "D", shouldMatch: false }, // too short
];

// Inline copy of the artistMatches function (mirror the one in
// fetch-lyrics.ts so we can test it without running the full fetch).
function artistMatches(foundArtist: string, expected: string): boolean {
  const f = foundArtist.toLowerCase().trim();
  const e = expected.toLowerCase().trim();
  if (!f || !e) return false;
  if (f === e) return true;
  const fPrimary = f.split(/\s+(?:feat\.?|featuring|ft\.?|&|\band\b|\bwith\b)\b/i)[0]!.trim();
  const ePrimary = e.split(/\s+(?:feat\.?|featuring|ft\.?|&|\band\b|\bwith\b)\b/i)[0]!.trim();
  if (!fPrimary || !ePrimary) return false;
  if (fPrimary === ePrimary) return true;
  if (fPrimary.includes(ePrimary) || ePrimary.includes(fPrimary)) {
    return fPrimary.length >= 2 && ePrimary.length >= 2;
  }
  return false;
}

let pass = 0;
let fail = 0;
for (const c of CASES) {
  const actual = artistMatches(c.found, c.expected);
  const ok = actual === c.shouldMatch;
  if (ok) pass++;
  else fail++;
  const tag = ok ? "✓" : "✗";
  const status = c.shouldMatch ? "MATCH" : "MISMATCH";
  const foundStr = JSON.stringify(c.found).padEnd(25);
  const expectedStr = JSON.stringify(c.expected).padEnd(15);
  console.log(`${tag} ${status}: found=${foundStr} expected=${expectedStr} -> actual=${actual}`);
}

console.log();
console.log(`${pass} pass, ${fail} fail`);

if (fail > 0) {
  console.error("FAIL: at least one artist-match case is wrong");
  process.exit(1);
}
console.log("OK: all artist-match cases pass");
