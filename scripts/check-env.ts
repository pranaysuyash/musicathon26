// Verify required env vars are present (without printing values).
// Usage: npm run check:env

import "dotenv/config";

const REQUIRED = [
  "MUSIXMATCH_API_KEY",
  "SONGSTATS_API_KEY",
  "HF_TOKEN",
] as const;

const OPTIONAL = [
  "ELEVENLABS_API_KEY",
  "CYANITE_API_KEY",
  "LALAL_AI_API_KEY",
  "JAMBASE_API_KEY",
] as const;

function mask(name: string, value: string | undefined): string {
  if (!value) return "MISSING";
  if (value.length < 8) return `present (len=${value.length})`;
  return `present (len=${value.length}, ${value.slice(0, 3)}...${value.slice(-3)})`;
}

function main() {
  console.log("VerseSignal env check\n");
  console.log("Required:");
  let allOk = true;
  for (const k of REQUIRED) {
    const v = process.env[k];
    const ok = !!v;
    if (!ok) allOk = false;
    console.log(`  ${ok ? "OK " : "!! "} ${k}: ${mask(k, v)}`);
  }
  console.log("\nOptional:");
  for (const k of OPTIONAL) {
    const v = process.env[k];
    console.log(`  --  ${k}: ${v ? mask(k, v) : "not set"}`);
  }
  console.log(`\n${allOk ? "All required present." : "Missing required vars."}`);
  process.exit(allOk ? 0 : 1);
}

main();
