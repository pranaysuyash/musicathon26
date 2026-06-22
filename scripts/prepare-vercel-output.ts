import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const OUTPUT_DIR = join(process.cwd(), ".vercel", "output");
const DB_SOURCE = join(process.cwd(), "data", "versesignal.db");
const SCHEMA_SOURCE = join(process.cwd(), "scripts", "schema.sql");
const FUNCTIONS_DIR = join(OUTPUT_DIR, "functions");

function copyDbIntoFunction(funcDir: string) {
  const targetDir = join(funcDir, "data");
  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
  copyFileSync(DB_SOURCE, join(targetDir, "versesignal.db"));
}

function copySchemaIntoFunction(funcDir: string) {
  const targetDir = join(funcDir, "scripts");
  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
  copyFileSync(SCHEMA_SOURCE, join(targetDir, "schema.sql"));
}

function walk(dir: string) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      if (entry.endsWith(".func")) {
        copyDbIntoFunction(full);
        copySchemaIntoFunction(full);
      } else {
        walk(full);
      }
    }
  }
}

if (!existsSync(DB_SOURCE)) {
  console.error("Database not found:", DB_SOURCE);
  process.exit(1);
}

if (!existsSync(SCHEMA_SOURCE)) {
  console.error("Schema file not found:", SCHEMA_SOURCE);
  process.exit(1);
}

if (!existsSync(FUNCTIONS_DIR)) {
  console.error("Vercel output functions dir not found. Run vercel build first.");
  process.exit(1);
}

walk(FUNCTIONS_DIR);
console.log("Copied database and schema into all Vercel function bundles.");
