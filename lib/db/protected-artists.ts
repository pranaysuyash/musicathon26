const PROTECTED_ARTIST_NAMES = new Set([
  "Tones and I",
  "Earth, Wind & Fire",
  "Florence + The Machine",
  "Mumford & Sons",
  "Simon & Garfunkel",
  "Tyler, The Creator",
  "Of Mice and Men",
  "And You Will Know Us by the Trail of Dead",
  "Jesus & Mary Chain",
  "Mates of State",
  "Joyce Manor",
  "And So I Watch You from Afar",
  "Martha and the Vandellas",
  "Sam & Dave",
  "Hall & Oates",
  "Johnny & the Hurricanes",
  "Benny and the Jets",
  "Pink Cream 69",
  "And One",
  "Stuck in the Sound",
  "Soko",
  "Lil Dicky and Chris Brown",
])

export function isProtectedArtist(name: string): boolean {
  return PROTECTED_ARTIST_NAMES.has(name) || PROTECTED_ARTIST_NAMES.has(name.trim())
}
