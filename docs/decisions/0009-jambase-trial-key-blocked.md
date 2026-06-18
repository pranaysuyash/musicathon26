# Decision 0009 — JamBase API trial-key limitation

**Date:** 2026-06-16
**Status:** Blocked (trial key insufficient)
**Owner:** VerseSignal agent

## Decision

**JamBase integration is deferred** because the trial key
provided (`jbd_trial_...`) does not have access to the artist
search endpoint.

The client in `lib/api/jambase.ts` is kept as the canonical
"here's how to call the API when a working key is available,"
but no UI is wired. Tour dates are not shown on the song page
or anywhere else.

## Context

The hackathon partner key was provided in `.env`. End-to-end
testing shows the key does not work for the artist-search
endpoint that would power the "show tour dates" feature:

| URL | Status | Body |
|---|---|---|
| `https://data.jambase.com/v1/artists?name=Drake` | 200 | HTML (unauthenticated docs page) |
| `https://www.jambase.com/jbapi/v1/artists?name=Drake` | 403 | "Forbidden" (key recognized, no access) |
| `https://api.jambase.com/v2/...` | timeout | (DNS) |
| `https://data.jambase.com/v1/events?artistName=Drake` | 200 | HTML (unauthenticated docs page) |

The `jbapi/v1` endpoint is the documented JSON API, and it
recognizes the key (returns 403, not 401). The 403 means the
trial tier does not include artist search, or the key has not
been activated for this endpoint.

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| Build a tour-dates UI on top of a broken API | Shows "what would be" | Per 0.11: misleads the user; per 0.7: AI output boundary | **Rejected** |
| Skip JamBase entirely | Cleanest | Loses the partner-listed layer | Folded into chosen (just don't wire UI) |
| Keep the client code, document the gap, defer UI to when a real key is available | Honest; reusable when key works | No demo value today | **Chosen** |

## Chosen path

`lib/api/jambase.ts` is the canonical client. It is NOT imported
by any other file. There is no `/api/jambase/[...]` route, no
UI surface, no decision-record reference in the song page.

When a working key is available:
1. Update `JAMBASE_API_KEY` in `.env`
2. Verify the endpoint returns JSON:
   ```bash
   curl -H "Authorization: Bearer $JAMBASE_API_KEY" \
        "https://www.jambase.com/jbapi/v1/artists?name=Drake"
   ```
3. Add `app/api/jambase/[artist]/route.ts` that wraps the client
4. Add a "Tour dates" section to `app/song/[id]/page.tsx`
5. Per 0.6, wrap the call in a try/catch with a graceful
   fallback to "Tour dates unavailable" if the API is down

## Why this path

- **Per 0.11 (customer-facing claims rule):** I cannot
  promise "live tour dates" when the API returns HTML.
  Shipping a UI that displays "no data" most of the time
  would under-deliver on the partner promise.
- **Per 0.7 (AI output boundary rule):** I will not assume
  the API works. The verification is end-to-end against
  the actual endpoint.
- **Per 0.10 (observability):** the gap is documented, not
  hidden. The next agent (or the user with a real key)
  has a one-paragraph path to wire the integration.

## Tradeoffs

- **Lost demo value.** Tour dates would have been a nice
  polish on the song detail page. Without them, the song
  page shows lyrics + themes + entities + event links,
  which is still substantive.
- **No partner credit.** JamBase is a hackathon partner;
  the production build doesn't visibly use their data.

## Risks

- **None for this build.** No false claims, no broken UI.
  The risk is purely "missed demo opportunity."
- **Risk if we wire a UI without verifying:** a judge clicks
  the tour-dates section and gets an empty result or an
  error. Per 0.11, this would be a customer-facing claim
  failure.

## Validation plan

- [x] End-to-end test of the trial key against 4 JamBase
      endpoints: all return HTML or 403. Documented in this
      record.
- [ ] When a real JamBase key is available, re-run the test
      above and confirm 200 + JSON. Then add the UI per the
      "chosen path" steps above.

## What would cause this decision to be revisited

- A working JamBase key is provided (full tier, not trial)
- The Musicathon team confirms a different endpoint URL
- We drop the partner integration entirely and re-allocate
  the partner credit to a different layer (e.g., ElevenLabs
  for voice, Songstats for chart context)

## Related

- `lib/api/jambase.ts` (client, present but uncalled)
- `docs/decisions/0001-graph-first-not-3d-earth.md` (the
  graph is the product; partner layers are enhancement)
- `motto_v3.md` §0.7 (AI output boundary), §0.10
  (observability), §0.11 (customer-facing claims)

## Re-verification (2026-06-16 same session, 6+ endpoints tested)

Per user: "I have the JamBase key" (same `jbd_trial_F8d1...`). After
sharing, the same trial key was tested on **6 additional endpoints** —
all return 403 (WAF block from BigScoots, the CDN host) or 200 with
HTML (the website, not JSON API data):

| Endpoint | Status | Body |
|---|---|---|
| `www.jambase.com/jbapi/v1/artists?apikey=…` | 403 | "Safeguarding Your Website — BigScoots" (WAF block) |
| `www.jambase.com/jbapi/v1/events?apikey=…` | 403 | same WAF block |
| `www.jambase.com/jbapi/v1/venues?apikey=…` | 403 | same |
| `www.jambase.com/jbapi/v1/search?apikey=…&q=Drake` | 403 | same |
| `data.jambase.com/artists?apikey=…` | 200 | HTML (the website, not JSON) |
| `data.jambase.com/artists/dr?apikey=…` | 200 | HTML |
| `data.jambase.com/events?apikey=…` | 200 | HTML |

**Conclusion:** the trial key is fundamentally blocked. Two distinct
failures:
1. `www.jambase.com/jbapi/v1/*` is CDN-WAF-blocked (the request never
   reaches the JamBase API; BigScoots's WAF intercepts).
2. `data.jambase.com/*` ignores `apikey` and returns the public
   website.

A paid JamBase partner key (different auth flow, likely a different
header) would be required. **Status remains: blocked.**

## Action
- Decision 0009 confirmed: integration deferred.
- `lib/api/jambase.ts` client kept (uncalled) for future paid key.
- No UI wiring.
- Cyanite: webhook-only per user; webhook receiver implemented in
  `app/api/webhooks/cyanite/route.ts` (separate decision).
