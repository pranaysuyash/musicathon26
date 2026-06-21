// Regional chart inventory (Tier 6 per decision 0019).
//
// Curated starter set of regional chart hits, ~5 per region
// across 2020–2023 (the demo window where US data is also
// available). This is NOT a comprehensive regional inventory
// (Tier 6 full) — it's the minimum needed to demonstrate
// the regional architecture works.
//
// Source: Wikipedia + Billboard local charts for each region.
// Each entry is the country's #1 year-end song for that year
// (or a high-ranked representative).

export interface RegionalChartEntry {
  year: number;
  rank: number;
  title: string;
  artist: string;
  region: "UK" | "IN" | "KR" | "BR" | "JP" | "DE" | "MX";
  era: "streaming_transition_era" | "global_streaming_era";
}

export const CHART_REGIONAL: RegionalChartEntry[] = [
  // === UK Singles Chart, year-end #1 ===
  { year: 2020, rank: 1, title: "Blinding Lights", artist: "The Weeknd", region: "UK", era: "global_streaming_era" },
  { year: 2021, rank: 1, title: "Bad Habits", artist: "Ed Sheeran", region: "UK", era: "global_streaming_era" },
  { year: 2022, rank: 1, title: "As It Was", artist: "Harry Styles", region: "UK", era: "global_streaming_era" },
  { year: 2023, rank: 1, title: "Flowers", artist: "Miley Cyrus", region: "UK", era: "global_streaming_era" },

  // === South Korea (Circle/Gaon/Melon) ===
  { year: 2020, rank: 1, title: "Dynamite", artist: "BTS", region: "KR", era: "global_streaming_era" },
  { year: 2021, rank: 1, title: "Butter", artist: "BTS", region: "KR", era: "global_streaming_era" },
  { year: 2022, rank: 1, title: "That That", artist: "PSY featuring Suga of BTS", region: "KR", era: "global_streaming_era" },
  { year: 2023, rank: 1, title: "Super Shy", artist: "NewJeans", region: "KR", era: "global_streaming_era" },

  // === India (IIS / Film/Non-Film) ===
  { year: 2020, rank: 1, title: "Vaaste", artist: "Dhvani Bhanushali and Nikhil D'Souza", region: "IN", era: "global_streaming_era" },
  { year: 2021, rank: 1, title: "Rangisari", artist: "Kanika Kapoor", region: "IN", era: "global_streaming_era" },
  { year: 2022, rank: 1, title: "Kesariya", artist: "Arijit Singh", region: "IN", era: "global_streaming_era" },
  { year: 2023, rank: 1, title: "Calm Down", artist: "Rema featuring Selena Gomez", region: "IN", era: "global_streaming_era" },

  // === Brazil (Crowley Top 100) ===
  { year: 2020, rank: 1, title: "Tá Rocheda", artist: "Os Barões da Pisadinha", region: "BR", era: "global_streaming_era" },
  { year: 2021, rank: 1, title: "Batom de Cereja", artist: "Israel & Rodolffo", region: "BR", era: "global_streaming_era" },
  { year: 2022, rank: 1, title: "Malvadão 3", artist: "Xand Avião", region: "BR", era: "global_streaming_era" },
  { year: 2023, rank: 1, title: "Nosso Quadro", artist: "Ana Castela and Agroplay", region: "BR", era: "global_streaming_era" },

  // === Mexico (Monitor Latino) ===
  { year: 2020, rank: 1, title: "Tusa", artist: "Karol G and Nicki Minaj", region: "MX", era: "global_streaming_era" },
  { year: 2021, rank: 1, title: "Pepas", artist: "Farruko", region: "MX", era: "global_streaming_era" },
  { year: 2022, rank: 1, title: "Te Felicito", artist: "Shakira and Rauw Alejandro", region: "MX", era: "global_streaming_era" },
  { year: 2023, rank: 1, title: "Ella Baila Sola", artist: "Eslabon Armado and Peso Pluma", region: "MX", era: "global_streaming_era" },

  // === Germany (GfK Offizielle) ===
  { year: 2020, rank: 1, title: "Blinding Lights", artist: "The Weeknd", region: "DE", era: "global_streaming_era" },
  { year: 2021, rank: 1, title: "Wellerman", artist: "Nathan Evans", region: "DE", era: "global_streaming_era" },
  { year: 2022, rank: 1, title: "As It Was", artist: "Harry Styles", region: "DE", era: "global_streaming_era" },
  { year: 2023, rank: 1, title: "Flowers", artist: "Miley Cyrus", region: "DE", era: "global_streaming_era" },
];
