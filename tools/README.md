# tools/

Reusable project-local tooling. Per `/Users/pranay/AGENTS.md`
(Reusable Tools Practice), one-off scripts do **not** live in
`/tmp/`; they live here, with purpose, usage, and examples.

## Tools in this directory

| Path | Purpose | Usage |
|---|---|---|
| `test-artist-match.ts` | Smoke test for the `artistMatches` helper in `scripts/fetch-lyrics.ts`. Catches the regression that produced duplicate wrong lyrics (e.g., "Meant to Be" and "The Middle" both got the same track). | `npx tsx tools/test-artist-match.ts` |

## Conventions

- **Portable formats.** Python for CLI tooling, HTML/JS for
  local UI tools.
- **Descriptive names.** `audit-duplicate-lyrics.py` not
  `check.py`. `tools/README.md` indexes them.
- **Documented here, not in code.** Every tool lists: what it
  does, the exact command, the expected output, and an
  example.
- **No one-offs in /tmp/.** If a script in `/tmp/` is useful
  beyond its single use, move it here.
- **Idempotent.** Re-running a tool is a no-op or produces
  the same result.
- **First-class errors.** Tools exit non-zero on failure with
  a useful message; they don't print stack traces and call
  it a day.

## When to add a tool

Add a tool here when:

- You ran a one-off command twice
- The command is a useful regression check
- A future agent would benefit from re-running it
- The command is a debugging aid you'd want future-you to
  have on hand

Don't add a tool here when:

- The command is a one-shot demo query
- The result is captured better in a doc or test
- A existing tool covers it (extend that one)

## Related

- `/Users/pranay/AGENTS.md` (Reusable Tools Practice)
- `motto_v3.md` §0.10 (Observability Is Delivery) — every
  meaningful behavior should have a way to be re-verified;
  tools are how we do that.
