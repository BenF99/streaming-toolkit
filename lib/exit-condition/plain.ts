import { FUNCTIONS, getFunction, type SelFunction } from "./catalog";

export interface PlainConstant {
  /** Picker label. */
  label: string;
  /** Noun without a leading article; the article is added at point of use. */
  noun: string;
  /** False for nouns that never take "the". */
  article: boolean;
  /** Bare plural for when a quantifier already precedes it ("at least 2 streams..."). */
  countNoun?: string;
}

export const PLAIN_CONSTANTS: Record<string, PlainConstant> = {
  totalStreams: { label: "Streams found so far", noun: "streams found so far", article: true, countNoun: "streams" },
  totalTimeTaken: { label: "Time spent searching", noun: "time spent searching", article: true },
  queryType: { label: "What's being searched for", noun: "what's being searched for", article: false },
  queriedAddons: { label: "Addons that have answered", noun: "addons that have answered", article: true, countNoun: "addons that have answered" },
  allAddons: { label: "All addons being queried", noun: "addons being queried", article: true, countNoun: "addons being queried" },
};

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/** Grouped by what you're narrowing by, not by the parser's own utility/filter/math split. */
export const PLAIN_GROUPS = ["Video", "Audio", "Source", "Size & age", "Matching", "Episodes", "Counting & maths", "Working with lists"] as const;
export type PlainGroup = (typeof PLAIN_GROUPS)[number];

export interface PlainFunction {
  /** Menu label, shown above the SEL name. */
  label: string;
  group: PlainGroup;
  /** Sentence clause with `{argName}` placeholders, reads on from a noun phrase. */
  phrase?: string;
  /** Same, for when every optional argument is empty. */
  bare?: string;
  /** For a step that reduces a list of numbers to one: the word naming the reduction. */
  word?: string;
}

export const PLAIN_FUNCTIONS: Record<string, PlainFunction> = {
  // --- Video -------------------------------------------------------------
  resolution: { label: "Resolution", group: "Video", phrase: "that are {values}" },
  quality: { label: "Quality", group: "Video", phrase: "that are {values}" },
  encode: { label: "Encoding", group: "Video", phrase: "encoded as {values}" },
  visualTag: { label: "HDR / Dolby Vision", group: "Video", phrase: "with {values}" },

  // --- Audio -------------------------------------------------------------
  audioTag: { label: "Audio format", group: "Audio", phrase: "with {values} audio" },
  audioChannels: { label: "Audio channels", group: "Audio", phrase: "with {values} audio" },
  language: { label: "Language", group: "Audio", phrase: "in {values}" },
  subtitle: { label: "Subtitles", group: "Audio", phrase: "subtitled in {values}" },

  // --- Source ------------------------------------------------------------
  type: { label: "Stream type", group: "Source", phrase: "that are {values} streams" },
  service: { label: "Debrid service", group: "Source", phrase: "on {values}" },
  cached: { label: "Cached only", group: "Source", phrase: "that are cached" },
  uncached: { label: "Not cached", group: "Source", phrase: "that aren't cached" },
  library: { label: "In your library", group: "Source", phrase: "already in your library" },
  addon: { label: "From an addon", group: "Source", phrase: "from {names}" },
  indexer: { label: "From an indexer", group: "Source", phrase: "from {names}" },
  releaseGroup: { label: "Release group", group: "Source", phrase: "from {names}", bare: "from a known release group" },
  seadex: { label: "SeaDex picks", group: "Source", phrase: "listed on SeaDex" },
  idMatched: { label: "Matched by ID", group: "Source", phrase: "matched by ID rather than by title" },

  // --- Size & age --------------------------------------------------------
  size: { label: "File size", group: "Size & age", phrase: "between {min} and {max} in size" },
  bitrate: { label: "Bitrate", group: "Size & age", phrase: "between {min} and {max}" },
  age: { label: "Age", group: "Size & age", phrase: "between {min} and {max} hours old" },
  seeders: { label: "Seeders", group: "Size & age", phrase: "with {min} to {max} seeders" },

  // --- Matching ----------------------------------------------------------
  keyword: { label: "Contains a keyword", group: "Matching", phrase: "whose {attributes} mentions {keywords}" },
  message: { label: "Stream message", group: "Matching", phrase: "whose message {mode} {messages}" },
  regexMatched: { label: "Matched a regex filter", group: "Matching", phrase: "that matched the regex filter {names}", bare: "that matched any regex filter" },
  regexMatchedInRange: { label: "Regex filter rank", group: "Matching", phrase: "whose matched regex filter ranks {min} to {max}" },
  seMatched: { label: "Matched an expression", group: "Matching", phrase: "that matched the expression {names}", bare: "that matched any preferred expression" },
  seMatchedInRange: { label: "Expression rank", group: "Matching", phrase: "whose matched expression ranks {min} to {max}" },
  rseMatched: { label: "Matched a ranked expression", group: "Matching", phrase: "that matched the ranked expression {names}", bare: "that matched any ranked expression" },
  streamExpressionScore: { label: "Expression score", group: "Matching", phrase: "scoring {min} to {max}" },
  regexScore: { label: "Regex score", group: "Matching", phrase: "with a regex score of {min} to {max}" },

  // --- Episodes ----------------------------------------------------------
  seasonPack: { label: "Season packs", group: "Episodes", phrase: "that are season packs" },
  multiEpisode: { label: "Multiple episodes", group: "Episodes", phrase: "containing at least {minEpisodes} episodes" },

  // --- Counting & maths --------------------------------------------------
  count: { label: "How many", group: "Counting & maths" },
  values: { label: "Pull out a number", group: "Counting & maths" },
  max: { label: "Highest", group: "Counting & maths", word: "highest" },
  min: { label: "Lowest", group: "Counting & maths", word: "lowest" },
  avg: { label: "Average", group: "Counting & maths", word: "average" },
  sum: { label: "Total", group: "Counting & maths", word: "total" },
  median: { label: "Median", group: "Counting & maths", word: "median" },
  mode: { label: "Most common", group: "Counting & maths", word: "most common" },
  range: { label: "Spread", group: "Counting & maths", word: "spread of" },
  variance: { label: "Variance", group: "Counting & maths", word: "variance in" },
  stddev: { label: "Standard deviation", group: "Counting & maths", word: "standard deviation of" },
  q1: { label: "25th percentile", group: "Counting & maths", word: "25th-percentile" },
  q3: { label: "75th percentile", group: "Counting & maths", word: "75th-percentile" },
  iqr: { label: "Interquartile range", group: "Counting & maths", word: "interquartile range of" },
  skewness: { label: "Skew", group: "Counting & maths", word: "skew of" },
  kurtosis: { label: "Kurtosis", group: "Counting & maths", word: "kurtosis of" },
  percentile: { label: "Percentile", group: "Counting & maths", word: "{p}th-percentile" },

  // --- Working with lists ------------------------------------------------
  negate: { label: "Exclude some streams", group: "Working with lists", phrase: "excluding {streamsToExclude}" },
  merge: { label: "Combine lists", group: "Working with lists", phrase: "combined with {streamArrays}" },
  slice: { label: "Take a range", group: "Working with lists", phrase: "from position {start} to {end}" },
  perGroup: { label: "Limit per group", group: "Working with lists", phrase: "with at most {n} per {attribute}" },
  passthrough: { label: "Skip pipeline stages", group: "Working with lists", phrase: "flagged to skip {stages}" },
};

export function plainFunction(id: string): PlainFunction | undefined {
  return PLAIN_FUNCTIONS[id];
}

/** Menu label for a function: its plain name, falling back to the SEL name. */
export function functionLabel(id: string): string {
  return PLAIN_FUNCTIONS[id]?.label ?? getFunction(id).label;
}

/** Plain name for an argument. Splits camelCase and renames the single letters. */
const ARG_LABELS: Record<string, string> = {
  n: "how many per group",
  p: "percentile",
  streamsToExclude: "streams to leave out",
  streamArrays: "other lists",
  filterValues: "only these groups",
  minEpisodes: "fewest episodes",
  values: "which ones",
  names: "which ones",
  keywords: "words to look for",
  attributes: "look in",
  messages: "text to look for",
  stages: "which stages",
  mode: "how to match",
  method: "how to match",
  min: "at least",
  max: "at most",
  start: "from",
  end: "to",
};

export function argLabel(name: string): string {
  return ARG_LABELS[name] ?? name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
}

/** Functions accepting `type`, grouped for the menu in PLAIN_GROUPS order. */
export function groupedFunctions(options: SelFunction[]): { group: string; fns: SelFunction[] }[] {
  const byGroup = new Map<string, SelFunction[]>();
  for (const fn of options) {
    const group = PLAIN_FUNCTIONS[fn.id]?.group ?? "Working with lists";
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group)!.push(fn);
  }
  return PLAIN_GROUPS.filter((g) => byGroup.has(g)).map((g) => ({ group: g, fns: byGroup.get(g)! }));
}

/** Free-text match over the plain label, the SEL name, and the description. */
export function matchesQuery(fn: SelFunction, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  return [functionLabel(fn.id), fn.label, fn.description].some((s) => s.toLowerCase().includes(q));
}

/** Every function id the catalog knows that has no phrasing here, for the coverage test. */
export function unphrasedFunctionIds(): string[] {
  return FUNCTIONS.filter((f) => !PLAIN_FUNCTIONS[f.id]).map((f) => f.id);
}
