# Musicathon 2026 — Lyric Atlas

A music-cultural knowledge graph: how popular songs, lyrics, artists, moods, collaborators, named entities, and world events connect across time.

## Chart data framing
- **1960–2019**: U.S. chart-memory mode (Billboard Hot 100 / year-end proxies)
- **2020+**: Global streaming mode (Billboard Global 200 / Songstats)

## Partner APIs
- **Musixmatch**: lyrics, richsync, translations (foundation)
- **Songstats**: chart/playlist/artist performance context (cultural weight)
- **Cyanite**: audio mood/genre/energy (validate lyric emotion vs. sound)
- **ElevenLabs**: voice search + narration
- **JamBase**: tours/venues for the Earth layer
- **LALAL.AI**: optional stem split for uploads
- **n8n**: ingestion pipeline
- **Replit**: deploy surface

## Setup
```bash
cp .env.example .env  # already created with hackathon keys
npm install
npm run dev
```
