export type Locale = "en" | "es";

export const LOCALES: Locale[] = ["en", "es"];

const STRINGS = {
  en: {
    "home.hero-subtitle":
      "When the world was going through something, what was it singing?",
    "home.description":
      "VerseSignal is a long-term music meaning graph: target scope is 1960s–2023, staged by chart era. The shipped demo slice is 2018–2023.",
    "home.era-strategy":
      "Era strategy: 1960s–1970s (chart-memory mode), 1980s–1990s (MTV + radio), 2000s–2010s (digital transition), 2020–2023 (Billboard Global 200 + streaming).",
    "home.pick-year": "Pick a year to start",
    "home.pick-event": "Or pick a context to verify",
    "home.nav.graph": "Open Graph Explorer",
    "home.nav.ask": "Ask the Graph",
    "home.nav.globe": "Cultural Weather Map",
    "home.nav.scrub": "Timeline Scrubber",

    "lens.title": "Cultural Lens",
    "lens.subtitle": "What were the charts saying in",
    "lens.voice-title": "Voice of the year",
    "lens.voice-subtitle": "Region-aware narrated cultural brief for",
    "lens.events-title": "Candidate contexts to verify",
    "lens.events-subtitle": "possible context(s) with a temporal overlap to",

    "event.back": "← VerseSignal home",
    "event.title": "CONTEXT LENS",
    "event.not-found": "Event not found",
    "event.open-in-graph": "Open in meaning graph",
    "event.articles": "Read related context coverage",

    "articles.title": "Context articles",
    "articles.back": "← Back to context",
    "articles.empty": "No context articles are stored yet. Add rows to event_articles when build/data ingestion supplies source URLs.",
    "articles.none": "No articles available yet.",

    "ask.title": "Ask the graph",
    "ask.description": "Type a feeling, lyric, or pair of nodes and we’ll turn it into songs, routes, and evidence-backed paths.",
    "ask.back": "← Back to graph explorer",

    "globe.title": "Cultural weather map",
    "globe.description": "A song-led regional weather surface for the current seeded demo corpus, showing where the signal gets hot, thin, or uncertain.",
    "globe.region-title": "Regional weather",

    "scrub.title": "Timeline scrubber",
    "scrub.description": "Scrub through years in the current region and jump to lens pages where signals, events, and songs are precomputed.",

    "common.back": "← Back",
    "common.events": "events",
    "common.songs": "songs",
    "common.lang-label": "Language",
    "common.lang-en": "English",
    "common.lang-es": "Español",
  },
  es: {
    "home.hero-subtitle":
      "Cuando el mundo estaba viviendo algo intenso, ¿qué estaba cantando?",
    "home.description":
      "VerseSignal es un grafo de significado musical de largo alcance: alcance objetivo 1960–2023, por eras de ranking. La demo desplegada cubre 2018–2023.",
    "home.era-strategy":
      "Estrategia por eras: 1960–1970 (memoria de charts), 1980–1990 (MTV + radio), 2000–2010 (transición digital), 2020–2023 (Billboard Global 200 + streaming).",
    "home.pick-year": "Empieza por un año",
    "home.pick-event": "O por un contexto para verificar",
    "home.nav.graph": "Abrir Graph Explorer",
    "home.nav.ask": "Preguntar al grafo",
    "home.nav.globe": "Mapa climático cultural",
    "home.nav.scrub": "Barra de tiempo",

    "lens.title": "Lente cultural",
    "lens.subtitle": "¿Qué decían los charts en",
    "lens.voice-title": "Voz del año",
    "lens.voice-subtitle": "Resumen narrativo con enfoque regional para",
    "lens.events-title": "Contextos candidatos para verificar",
    "lens.events-subtitle": "posibles contextos con solapamiento temporal en",

    "event.back": "← Inicio de VerseSignal",
    "event.title": "LENTE DE CONTEXTO",
    "event.not-found": "Evento no encontrado",
    "event.open-in-graph": "Abrir en el grafo de significado",
    "event.articles": "Ver cobertura del contexto",

    "articles.title": "Artículos del contexto",
    "articles.back": "← Volver al contexto",
    "articles.empty": "Aún no hay artículos del contexto. Añade filas a event_articles cuando el pipeline de ingesta los proporcione.",
    "articles.none": "Sin artículos disponibles aún.",

    "ask.title": "Preguntar al grafo",
    "ask.description": "Escribe una sensación, una letra o dos nodos y lo convertiremos en canciones, rutas y caminos respaldados por evidencia.",
    "ask.back": "← Volver al graph explorer",

    "globe.title": "Mapa climático cultural",
    "globe.description": "Una superficie regional guiada por canciones para el corpus demo actual, mostrando dónde la señal se vuelve intensa, fina o incierta.",
    "globe.region-title": "Clima regional",

    "scrub.title": "Deslizador temporal",
    "scrub.description": "Navega por años en la región actual y abre lentes de año donde se precomputa señal, eventos y canciones.",

    "common.back": "← Volver",
    "common.events": "eventos",
    "common.songs": "canciones",
    "common.lang-label": "Idioma",
    "common.lang-en": "English",
    "common.lang-es": "Español",
  },
} as const;

export type I18nKey = keyof typeof STRINGS.en;

export function resolveLocale(value?: string | null): Locale {
  if (!value) return "en";
  return value.toLowerCase() in STRINGS ? (value.toLowerCase() as Locale) : "en";
}

export function t(locale: Locale, key: I18nKey): string {
  return STRINGS[locale][key];
}

export const localePairs = [
  { code: "en" as Locale, key: "common.lang-en" },
  { code: "es" as Locale, key: "common.lang-es" },
] as const;
