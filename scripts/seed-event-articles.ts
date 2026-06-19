// Seed event_articles with curated reference articles per event.
//
// Source: Wikipedia, Britannica, and other public references that
// summarize the event. Per 0.11 (Customer-Facing Claims Rule), we
// only cite sources we can defend. The `source` field names the
// publisher; the `source_url` is the canonical link.

import { closeDb, getDb, initDb } from "../lib/db";

interface ArticleSeed {
  event_id: string;
  source: string;
  source_url: string;
  title: string;
  published_at: string | null;
  summary: string;
}

const ARTICLES: ArticleSeed[] = [
  // === MeToo movement ===
  {
    event_id: "versesignal:ev:metoo",
    source: "Wikipedia",
    source_url: "https://en.wikipedia.org/wiki/Me_Too_movement",
    title: "Me Too movement",
    published_at: null,
    summary: "Wikipedia's overview of the movement that began in 2017 with disclosures of sexual harassment and assault in the entertainment industry.",
  },
  {
    event_id: "versesignal:ev:metoo",
    source: "Britannica",
    source_url: "https://www.britannica.com/topic/Me-Too-movement",
    title: "Me Too movement | Social movement",
    published_at: null,
    summary: "Britannica's entry on the social movement against sexual abuse and harassment, started by Tarana Burke in 2006 and viralized in 2017.",
  },
  // === Climate crisis visibility ===
  {
    event_id: "versesignal:ev:climate_crisis",
    source: "Wikipedia",
    source_url: "https://en.wikipedia.org/wiki/Climate_change",
    title: "Climate change",
    published_at: null,
    summary: "Wikipedia's overview of long-term shifts in temperatures and weather patterns, primarily driven by human activities since the 1800s.",
  },
  {
    event_id: "versesignal:ev:climate_crisis",
    source: "NASA",
    source_url: "https://climate.nasa.gov/evidence/",
    title: "Evidence: How do we know climate change is happening?",
    published_at: null,
    summary: "NASA's evidence page showing temperature records, ice sheet loss, sea level rise, and ocean warming.",
  },
  // === Spotify IPO / Streaming Era ===
  {
    event_id: "versesignal:ev:streaming_era_spotify_ipo",
    source: "Wikipedia",
    source_url: "https://en.wikipedia.org/wiki/Spotify",
    title: "Spotify",
    published_at: null,
    summary: "Wikipedia's article on the audio streaming service, including its April 2018 direct listing on the NYSE.",
  },
  {
    event_id: "versesignal:ev:streaming_era_spotify_ipo",
    source: "Billboard",
    source_url: "https://www.billboard.com/pro/spotify-ipo-2018-streaming-industry/",
    title: "Spotify's 2018 IPO: What it meant for the music industry",
    published_at: "2018-04-03",
    summary: "Billboard's coverage of Spotify's direct listing on the NYSE, valued at ~$26.5B, and the shift to streaming-first chart accounting.",
  },
  // === COVID economic recession ===
  {
    event_id: "versesignal:ev:recession_covid",
    source: "Wikipedia",
    source_url: "https://en.wikipedia.org/wiki/COVID-19_recession",
    title: "COVID-19 recession",
    published_at: null,
    summary: "Wikipedia's article on the global economic recession caused by the COVID-19 pandemic, the steepest downturn since the Great Depression.",
  },
  {
    event_id: "versesignal:ev:recession_covid",
    source: "IMF",
    source_url: "https://www.imf.org/en/News/Articles/2020/06/24/we-face-a-recession-like-no-other",
    title: "We Face a Recession Like No Other",
    published_at: "2020-04-13",
    summary: "Kristalina Georgieva (IMF Managing Director) on the unprecedented economic contraction from the pandemic.",
  },
  // === COVID-19 lockdowns ===
  {
    event_id: "versesignal:ev:covid_19",
    source: "Wikipedia",
    source_url: "https://en.wikipedia.org/wiki/COVID-19_pandemic",
    title: "COVID-19 pandemic",
    published_at: null,
    summary: "Wikipedia's overview of the coronavirus disease 2019 pandemic declared by the WHO on 11 March 2020.",
  },
  {
    event_id: "versesignal:ev:covid_19",
    source: "WHO",
    source_url: "https://www.who.int/news/item/27-04-2020-who-timeline---covid-19",
    title: "WHO Timeline — COVID-19",
    published_at: "2020-04-27",
    summary: "WHO's official timeline of the pandemic, from the first case in China to global spread.",
  },
  // === BLM protests ===
  {
    event_id: "versesignal:ev:blm_2020",
    source: "Wikipedia",
    source_url: "https://en.wikipedia.org/wiki/George_Floyd_protests",
    title: "George Floyd protests",
    published_at: null,
    summary: "Wikipedia's article on the 2020 wave of Black Lives Matter protests following the murder of George Floyd on 25 May 2020.",
  },
  {
    event_id: "versesignal:ev:blm_2020",
    source: "NAACP",
    source_url: "https://naacp.org/find-resources/history-explained/civil-rights-timeline",
    title: "Civil Rights Movement Timeline",
    published_at: null,
    summary: "NAACP's timeline of civil rights milestones, contextualizing the 2020 protests within the longer movement.",
  },
  // === US 2020 election ===
  {
    event_id: "versesignal:ev:us_election_2020",
    source: "Wikipedia",
    source_url: "https://en.wikipedia.org/wiki/2020_United_States_presidential_election",
    title: "2020 United States presidential election",
    published_at: null,
    summary: "Wikipedia's article on the 59th US presidential election, won by Joe Biden over incumbent Donald Trump.",
  },
  // === COVID vaccine rollout ===
  {
    event_id: "versesignal:ev:covid_vaccine",
    source: "Wikipedia",
    source_url: "https://en.wikipedia.org/wiki/COVID-19_vaccine",
    title: "COVID-19 vaccine",
    published_at: null,
    summary: "Wikipedia's overview of vaccines developed to counter the SARS-CoV-2 virus, including Pfizer-BioNTech and Moderna.",
  },
  {
    event_id: "versesignal:ev:covid_vaccine",
    source: "CDC",
    source_url: "https://www.cdc.gov/coronavirus/2019-ncov/vaccines/different-vaccines/Pfizer-BioNTech.html",
    title: "Pfizer-BioNTech COVID-19 Vaccine Overview",
    published_at: "2020-12-12",
    summary: "CDC's information on the first COVID-19 vaccine authorized in the US, on 11 December 2020.",
  },
  // === Capitol Riot ===
  {
    event_id: "versesignal:ev:capitol_riot",
    source: "Wikipedia",
    source_url: "https://en.wikipedia.org/wiki/January_6_United_States_Capitol_attack",
    title: "January 6 United States Capitol attack",
    published_at: null,
    summary: "Wikipedia's article on the 2021 assault on the US Capitol by supporters of then-President Trump to overturn the 2020 election results.",
  },
  {
    event_id: "versesignal:ev:capitol_riot",
    source: "Library of Congress",
    source_url: "https://www.loc.gov/collections/january-6th-attack-on-the-us-capitol/",
    title: "January 6th Attack on the U.S. Capitol: Primary Source Collection",
    published_at: null,
    summary: "LoC's primary source collection documenting the events of January 6, 2021.",
  },
  // === Ukraine War ===
  {
    event_id: "versesignal:ev:ukraine_war",
    source: "Wikipedia",
    source_url: "https://en.wikipedia.org/wiki/Russian_invasion_of_Ukraine",
    title: "Russian invasion of Ukraine",
    published_at: null,
    summary: "Wikipedia's article on the full-scale invasion of Ukraine by Russia on 24 February 2022, the largest European war since WWII.",
  },
  {
    event_id: "versesignal:ev:ukraine_war",
    source: "Council on Foreign Relations",
    source_url: "https://www.cfr.org/global-conflict-tracker/conflict/conflict-ukraine",
    title: "Conflict in Ukraine",
    published_at: null,
    summary: "CFR's global conflict tracker entry on the Russia-Ukraine war, with timeline, casualties, and refugee data.",
  },
  // === Roe v. Wade ===
  {
    event_id: "versesignal:ev:roevwade",
    source: "Wikipedia",
    source_url: "https://en.wikipedia.org/wiki/Dobbs_v._Jackson_Women%27s_Health_Organization",
    title: "Dobbs v. Jackson Women's Health Organization",
    published_at: null,
    summary: "Wikipedia's article on the 2022 Supreme Court ruling that overturned Roe v. Wade.",
  },
  {
    event_id: "versesignal:ev:roevwade",
    source: "Supreme Court",
    source_url: "https://www.supremecourt.gov/opinions/21pdf/19-1392_6j37.pdf",
    title: "Dobbs v. Jackson Women's Health Organization — Syllabus",
    published_at: "2022-06-24",
    summary: "Official Supreme Court syllabus for the Dobbs decision.",
  },
  // === Queen Elizabeth II ===
  {
    event_id: "versesignal:ev:queen_elizabeth",
    source: "Wikipedia",
    source_url: "https://en.wikipedia.org/wiki/Death_and_state_funeral_of_Elizabeth_II",
    title: "Death and state funeral of Elizabeth II",
    published_at: null,
    summary: "Wikipedia's article on the death of Elizabeth II on 8 September 2022, the longest-reigning British monarch.",
  },
  {
    event_id: "versesignal:ev:queen_elizabeth",
    source: "Royal.uk",
    source_url: "https://www.royal.uk/announcement-death-her-majesty-queen",
    title: "A statement from His Majesty The King",
    published_at: "2022-09-08",
    summary: "Official announcement of the death of Queen Elizabeth II by King Charles III.",
  },
  // === AI Boom / ChatGPT ===
  {
    event_id: "versesignal:ev:ai_boom_chatgpt",
    source: "Wikipedia",
    source_url: "https://en.wikipedia.org/wiki/ChatGPT",
    title: "ChatGPT",
    published_at: null,
    summary: "Wikipedia's article on the AI chatbot launched by OpenAI on 30 November 2022, which reached 1M users in 5 days.",
  },
  {
    event_id: "versesignal:ev:ai_boom_chatgpt",
    source: "OpenAI",
    source_url: "https://openai.com/blog/chatgpt",
    title: "Introducing ChatGPT",
    published_at: "2022-11-30",
    summary: "OpenAI's launch blog post for ChatGPT, the research preview release.",
  },
  // === Taylor Swift Eras Tour ===
  {
    event_id: "versesignal:ev:taylor_swift_eras_tour",
    source: "Wikipedia",
    source_url: "https://en.wikipedia.org/wiki/The_Eras_Tour",
    title: "The Eras Tour",
    published_at: null,
    summary: "Wikipedia's article on Taylor Swift's 6th concert tour, the highest-grossing concert tour of all time (>$1B in 2023).",
  },
  {
    event_id: "versesignal:ev:taylor_swift_eras_tour",
    source: "Pollstar",
    source_url: "https://www.pollstar.com/",
    title: "Pollstar Boxoffice — Year-End 2023",
    published_at: "2023-12-31",
    summary: "Pollstar's year-end box office data confirming the Eras Tour's record-breaking revenue.",
  },
  // === Barbie / Barbenheimer ===
  {
    event_id: "versesignal:ev:barbie_movie",
    source: "Wikipedia",
    source_url: "https://en.wikipedia.org/wiki/Barbie_(film)",
    title: "Barbie (film)",
    published_at: null,
    summary: "Wikipedia's article on the 2023 fantasy comedy directed by Greta Gerwig, the highest-grossing film of 2023.",
  },
  {
    event_id: "versesignal:ev:barbie_movie",
    source: "Variety",
    source_url: "https://variety.com/2023/film/news/barbie-opening-weekend-box-office-record-1235685517/",
    title: "Barbie Sets Opening Weekend Record",
    published_at: "2023-07-23",
    summary: "Variety's coverage of Barbie's record $155M domestic opening weekend.",
  },
];

function main() {
  initDb();
  const db = getDb();
  // Idempotent: clear before re-seeding so the table is a clean state.
  db.exec("DELETE FROM event_articles");

  const insert = db.prepare(`
    INSERT INTO event_articles
      (id, event_id, source, source_url, title, published_at, summary, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  let count = 0;
  for (const a of ARTICLES) {
    const id = `versesignal:ea:${slug(a.event_id)}-${slug(a.title)}`;
    insert.run(id, a.event_id, a.source, a.source_url, a.title, a.published_at, a.summary);
    count++;
  }
  console.log(`✓ Seeded ${count} event articles across ${new Set(ARTICLES.map((a) => a.event_id)).size} events.`);
  closeDb();
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 60);
}

main();
