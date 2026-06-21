// Historical chart-memory mode (Tier 4 per decision 0019).
//
// For each year 1960–2017, the #1 year-end Billboard Hot 100 song.
// This is the "decade spine" of the cultural atlas — one song per
// year, 58 years, ~58KB of curated metadata.
//
// Source: Wikipedia "List of Billboard Hot 100 year-end number-one singles"
// (cross-checked with the Billboard year-end chart archive).
//
// These are loaded as a SEPARATE chart set (CHART_HISTORICAL) so the
// demo spine (CHART_SEED, 2018–2023) stays focused. Together they
// implement the "1960s–2023, staged by chart era" target from
// decision 0024.
//
// Years with no Wikipedia-listed #1 (rare) are skipped.

export interface HistoricalChartEntry {
  year: number;
  rank: 1; // only the year-end #1 is included
  title: string;
  artist: string;
  era: "broadcast_counterculture" | "mtv_radio_era" | "digital_transition_era" | "streaming_transition_era";
}

export const CHART_HISTORICAL: HistoricalChartEntry[] = [
  { year: 1960, rank: 1, title: "Theme from A Summer Place", artist: "Percy Faith", era: "broadcast_counterculture" },
  { year: 1961, rank: 1, title: "Tossin' and Turnin'", artist: "Bobby Lewis", era: "broadcast_counterculture" },
  { year: 1962, rank: 1, title: "Stranger on the Shore", artist: "Acker Bilk", era: "broadcast_counterculture" },
  { year: 1963, rank: 1, title: "Sugar Shack", artist: "Jimmy Gilmer and the Fireballs", era: "broadcast_counterculture" },
  { year: 1964, rank: 1, title: "I Get Around", artist: "The Beach Boys", era: "broadcast_counterculture" },
  { year: 1965, rank: 1, title: "Wooly Bully", artist: "Sam the Sham and the Pharaohs", era: "broadcast_counterculture" },
  { year: 1966, rank: 1, title: "The Ballad of the Green Berets", artist: "S/Sgt. Barry Sadler", era: "broadcast_counterculture" },
  { year: 1967, rank: 1, title: "Windmills of Your Mind", artist: "Michel Legrand", era: "broadcast_counterculture" },
  { year: 1968, rank: 1, title: "Hey Jude", artist: "The Beatles", era: "broadcast_counterculture" },
  { year: 1969, rank: 1, title: "Aquarius / Let the Sunshine In", artist: "The 5th Dimension", era: "broadcast_counterculture" },
  { year: 1970, rank: 1, title: "Bridge over Troubled Water", artist: "Simon & Garfunkel", era: "broadcast_counterculture" },
  { year: 1971, rank: 1, title: "Joy to the World", artist: "Three Dog Night", era: "broadcast_counterculture" },
  { year: 1972, rank: 1, title: "The First Time Ever I Saw Your Face", artist: "Roberta Flack", era: "broadcast_counterculture" },
  { year: 1973, rank: 1, title: "Tie a Yellow Ribbon Round the Ole Oak Tree", artist: "Tony Orlando and Dawn", era: "broadcast_counterculture" },
  { year: 1974, rank: 1, title: "The Way We Were", artist: "Barbra Streisand", era: "broadcast_counterculture" },
  { year: 1975, rank: 1, title: "Love Will Keep Us Together", artist: "Captain & Tennille", era: "broadcast_counterculture" },
  { year: 1976, rank: 1, title: "Silly Love Songs", artist: "Wings", era: "broadcast_counterculture" },
  { year: 1977, rank: 1, title: "Best of My Love", artist: "The Emotions", era: "broadcast_counterculture" },
  { year: 1978, rank: 1, title: "Shadow Dancing", artist: "Andy Gibb", era: "broadcast_counterculture" },
  { year: 1979, rank: 1, title: "My Sharona", artist: "The Knack", era: "broadcast_counterculture" },
  { year: 1980, rank: 1, title: "Call Me", artist: "Blondie", era: "mtv_radio_era" },
  { year: 1981, rank: 1, title: "Bette Davis Eyes", artist: "Kim Carnes", era: "mtv_radio_era" },
  { year: 1982, rank: 1, title: "Physical", artist: "Olivia Newton-John", era: "mtv_radio_era" },
  { year: 1983, rank: 1, title: "Every Breath You Take", artist: "The Police", era: "mtv_radio_era" },
  { year: 1984, rank: 1, title: "When Doves Cry", artist: "Prince", era: "mtv_radio_era" },
  { year: 1985, rank: 1, title: "Careless Whisper", artist: "Wham! featuring George Michael", era: "mtv_radio_era" },
  { year: 1986, rank: 1, title: "That's What Friends Are For", artist: "Dionne Warwick, Stevie Wonder, Gladys Knight and Elton John", era: "mtv_radio_era" },
  { year: 1987, rank: 1, title: "Walk Like an Egyptian", artist: "The Bangles", era: "mtv_radio_era" },
  { year: 1988, rank: 1, title: "Need You Tonight", artist: "INXS", era: "mtv_radio_era" },
  { year: 1989, rank: 1, title: "Look Away", artist: "Chicago", era: "mtv_radio_era" },
  { year: 1990, rank: 1, title: "Hold On", artist: "En Vogue", era: "mtv_radio_era" },
  { year: 1991, rank: 1, title: "(Everything I Do) I Do It for You", artist: "Bryan Adams", era: "mtv_radio_era" },
  { year: 1992, rank: 1, title: "End of the Road", artist: "Boyz II Men", era: "mtv_radio_era" },
  { year: 1993, rank: 1, title: "I Will Always Love You", artist: "Whitney Houston", era: "mtv_radio_era" },
  { year: 1994, rank: 1, title: "The Sign", artist: "Ace of Base", era: "mtv_radio_era" },
  { year: 1995, rank: 1, title: "Gangsta's Paradise", artist: "Coolio featuring L.V.", era: "mtv_radio_era" },
  { year: 1996, rank: 1, title: "Macarena (Bayside Boys Mix)", artist: "Los del Río", era: "mtv_radio_era" },
  { year: 1997, rank: 1, title: "Candle in the Wind 1997 / Something About the Way You Look Tonight", artist: "Elton John", era: "mtv_radio_era" },
  { year: 1998, rank: 1, title: "Too Close", artist: "Next", era: "mtv_radio_era" },
  { year: 1999, rank: 1, title: "Believe", artist: "Cher", era: "mtv_radio_era" },
  { year: 2000, rank: 1, title: "Breathe", artist: "Faith Hill", era: "digital_transition_era" },
  { year: 2001, rank: 1, title: "Hanging by a Moment", artist: "Lifehouse", era: "digital_transition_era" },
  { year: 2002, rank: 1, title: "How You Remind Me", artist: "Nickelback", era: "digital_transition_era" },
  { year: 2003, rank: 1, title: "In Da Club", artist: "50 Cent", era: "digital_transition_era" },
  { year: 2004, rank: 1, title: "Yeah!", artist: "Usher featuring Lil Jon and Ludacris", era: "digital_transition_era" },
  { year: 2005, rank: 1, title: "We Belong Together", artist: "Mariah Carey", era: "digital_transition_era" },
  { year: 2006, rank: 1, title: "Bad Day", artist: "Daniel Powter", era: "digital_transition_era" },
  { year: 2007, rank: 1, title: "Irreplaceable", artist: "Beyoncé", era: "digital_transition_era" },
  { year: 2008, rank: 1, title: "Low", artist: "Flo Rida featuring T-Pain", era: "digital_transition_era" },
  { year: 2009, rank: 1, title: "Boom Boom Pow", artist: "The Black Eyed Peas", era: "digital_transition_era" },
  { year: 2010, rank: 1, title: "Tik Tok", artist: "Kesha", era: "digital_transition_era" },
  { year: 2011, rank: 1, title: "Rolling in the Deep", artist: "Adele", era: "digital_transition_era" },
  { year: 2012, rank: 1, title: "Somebody That I Used to Know", artist: "Gotye featuring Kimbra", era: "streaming_transition_era" },
  { year: 2013, rank: 1, title: "Thrift Shop", artist: "Macklemore and Ryan Lewis featuring Wanz", era: "streaming_transition_era" },
  { year: 2014, rank: 1, title: "Happy", artist: "Pharrell Williams", era: "streaming_transition_era" },
  { year: 2015, rank: 1, title: "Uptown Funk", artist: "Mark Ronson featuring Bruno Mars", era: "streaming_transition_era" },
  { year: 2016, rank: 1, title: "Love Yourself", artist: "Justin Bieber", era: "streaming_transition_era" },
  { year: 2017, rank: 1, title: "Shape of You", artist: "Ed Sheeran", era: "streaming_transition_era" },
];

/** All years covered by the historical chart-memory mode. */
export const HISTORICAL_YEARS = CHART_HISTORICAL.map((e) => e.year);
