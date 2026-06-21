# Genius Setup Guide (Decision 0035)

> **Status as of 2026-06-20:** Fixed and re-enabled. Initial attempt failed (silent wrong-page ingestion); the 3 bugs were identified and fixed per the post-mortem. Current coverage: 431/442 = 97.5% (2 songs recovered via the now-correct Genius client). The other 11 songs genuinely don't exist on Genius, LRCLib, or lyrics.ovh — they remain a documented gap. See [`docs/findings/2026-06-20-genius-integration-failed.md`](../findings/2026-06-20-genius-integration-failed.md) for the full failure → fix story.

This document is preserved for the future fix work and shows the Genius signup form values to use.

## What the Genius API gives us

- 1,500+ lyrics indexed per day, including regional/niche tracks Musixmatch and LRCLib don't carry
- Read-only access via `Authorization: Bearer <token>` — no OAuth flow needed at runtime
- Free for read access

## Step 1: Sign up at Genius

1. Create an account at https://genius.com (any email).
2. Go to https://genius.com/api-clients.
3. Click **"New API Client"**.

## Step 2: Fill the signup form

Genius requires these four fields at signup. **Concrete values, copy-paste these:**

| Field | Paste this |
|---|---|
| **App Name** | `VerseSignal` |
| **Icon URL** | `https://versesignal.vercel.app/api/og?type=default` |
| **App Website URL** | `https://versesignal.vercel.app` |
| **Redirect URI** | `https://versesignal.vercel.app/callback` |

**Important:** None of these URLs are validated by Genius for read-only access. The redirect URI doesn't need a working endpoint — Genius never redirects to it for our use case (we use `Authorization: Bearer <token>` for search, no OAuth dance). Replace `versesignal.vercel.app` with your custom domain if you deploy to one.

If the URL is `https://musicathon.pranay.dev` or any other domain, the values become:

- Icon URL: `https://musicathon.pranay.dev/api/og?type=default`
- App Website URL: `https://musicathon.pranay.dev`
- Redirect URI: `https://musicathon.pranay.dev/callback`

## Step 3: Generate the access token

After submission, Genius shows a **"Generate Access Token"** button. Click it. You'll get a long string like:

```
abc123def456ghi789jkl012mno345pqr678stu901vwx234yzA567BCDeFgHiJkLmN
```

This is what goes in `.env`.

## Step 4: Paste the token

Open your `.env` file and add (or uncomment):

```bash
GENIUS_ACCESS_TOKEN=abc123def456ghi789jkl012mno345pqr678stu901vwx234yzA567BCDeFgHiJkLmN
```

Save.

## Step 5: Run the targeted fetch

```bash
npm run db:fetch-lyrics-genius
```

This is a dedicated script that:
- Only targets songs with no lyrics yet (13 songs as of this writing)
- Tries Genius first (since Musixmatch + LRCLib + lyrics.ovh have already run for these)
- Falls back to LRCLib + lyrics.ovh if Genius misses
- Ingest result: should close 9-11 of the 13 remaining

## Step 6: Verify

```bash
sqlite3 data/versesignal.db "SELECT COUNT(DISTINCT song_id) FROM lyric_lines WHERE text IS NOT NULL AND text != ''"
```

You should see `429` or higher (was 429 before Genius; expected 440+ with Genius).

## What if I skip this?

Totally fine. The product is at **97.1% lyrics coverage** (429/442) without Genius. The 13 remaining are mostly country (Dustin Lynch, Eric Church), niche rap (Sleepy Hallow), and regional (Rangisari, Malvadão 3) — songs where Musixmatch and LRCLib both don't index.

The `db:fetch-lyrics-genius` script can be run any time, no rush.

## What I'd put in the form fields (if you want a concrete example)

- **App Name:** `VerseSignal`
- **Icon URL:** `https://your-demo.vercel.app/api/og?type=default`
- **App Website URL:** `https://your-demo.vercel.app`
- **Redirect URI:** `https://your-demo.vercel.app/callback`

Replace `your-demo.vercel.app` with wherever the app is deployed.
