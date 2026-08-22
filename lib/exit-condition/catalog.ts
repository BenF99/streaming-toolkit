// Stream Expression Language (SEL) catalog.
export type SelValueType =
  | "streams"
  | "number"
  | "numberArray"
  | "string"
  | "stringArray"
  | "boolean";

export interface SelConstant {
  id: string;
  label: string;
  type: SelValueType;
  description: string;
  /** Bare default rendered in the docs, shown as a hint. */
  fallback?: string;
}

export const CONSTANTS: SelConstant[] = [
  { id: "totalStreams", label: "totalStreams", type: "streams", description: "All streams gathered from addons queried so far (not the final candidate pool)" },
  { id: "totalTimeTaken", label: "totalTimeTaken", type: "number", description: "Total time spent so far (ms)" },
  { id: "queryType", label: "queryType", type: "string", description: 'Media type (e.g. "movie", "series", "anime.series", "anime.movie")' },
  { id: "queriedAddons", label: "queriedAddons", type: "stringArray", description: "Names of addons queried so far. Use the in operator to check for a specific one." },
  { id: "allAddons", label: "allAddons", type: "stringArray", description: "Names of every addon that was intended to be queried for this request" },
];

// ---------------------------------------------------------------------------
// Function argument specs
// ---------------------------------------------------------------------------

export type SelArgType = "number" | "string" | "boolean" | "streams";

export interface SelArgSpec {
  name: string;
  type: SelArgType;
  /** True when this arg accepts >=1 repeated values collected into an array. */
  variadic?: boolean;
  required?: boolean;
  /** Fixed accepted literal values (rendered as keycap chips). */
  options?: string[];
  /** Free values are still allowed alongside options (e.g. encode, visualTag). */
  freeform?: boolean;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  /** Hard bounds the AIOStreams parser enforces by throwing; the stepper clamps to them. */
  min?: number;
  max?: number;
  /** Name of the sibling argument this one must not exceed (a min/max pair). */
  noGreaterThan?: string;
}

export type SelFunctionCategory = "utility" | "filter" | "math";

export interface SelFunction {
  id: string;
  label: string;
  aliasOf?: string;
  category: SelFunctionCategory;
  /** Type this function expects as the value flowing into it from the chain. */
  pipeType: SelValueType;
  /** Which positional arg receives the piped value (default 0). */
  pipedArgIndex?: number;
  returns: SelValueType;
  args: SelArgSpec[];
  description: string;
  example?: string;
}

const RESOLUTIONS = ["2160p", "1440p", "1080p", "720p", "576p", "480p", "360p", "240p", "144p", "Unknown"];
const QUALITIES = ["Bluray REMUX", "Bluray", "WEB-DL", "WEBRip", "HDRip", "HC HD-Rip", "DVD REMUX", "DVDRip", "HDTV", "CAM", "TS", "TC", "SCR", "Unknown"];
const STREAM_TYPES = ["debrid", "usenet", "http", "live", "p2p", "external", "youtube"];
const SERVICES = ["realdebrid", "debridlink", "premiumize", "alldebrid", "torbox", "easydebrid", "debrider", "putio", "pikpak", "offcloud", "seedr", "easynews", "nzbdav", "altmount", "stremio_nntp", "stremthru_newz", "aiostreams", "torrin"];
const GROUP_ATTRS = ["resolution", "quality", "encode", "type", "service", "indexer", "releaseGroup", "visualTag", "audioTag", "audioChannel", "language", "subtitle"];
const VALUE_ATTRS = ["bitrate", "size", "folderSize", "age", "duration", "seeders", "seScore", "regexScore"];
const PASSTHROUGH_STAGES = ["filter", "language", "subtitle", "dedup", "limit", "excluded", "required", "title", "year", "episode", "digitalRelease"];
const KEYWORD_ATTRS = ["filename", "folderName", "indexer", "releaseGroup", "all", "*"];

export const FUNCTIONS: SelFunction[] = [
  // --- Utility ---------------------------------------------------------
  {
    id: "negate",
    label: "negate",
    category: "utility",
    pipeType: "streams",
    pipedArgIndex: 1,
    returns: "streams",
    description: "Set difference: the piped list with the given streams removed, matched by stream id. Returns streams, not true/false.",
    example: "negate(quality(streams, 'CAM', 'TS'), streams)",
    args: [{ name: "streamsToExclude", type: "streams", required: true, description: "Streams to exclude" }],
  },
  {
    id: "merge",
    label: "merge",
    category: "utility",
    pipeType: "streams",
    pipedArgIndex: 0,
    returns: "streams",
    description: "Combines multiple stream arrays into one, removing duplicates.",
    example: "merge(visualTag(streams, 'DV'), audioTag(streams, 'Atmos'))",
    args: [{ name: "streamArrays", type: "streams", variadic: true, required: true, description: "Stream lists to merge" }],
  },
  {
    id: "slice",
    label: "slice",
    category: "utility",
    pipeType: "streams",
    returns: "streams",
    description: "Returns a section of the stream list. Negative indices count from the end.",
    example: "slice(addon(streams, 'TorBox'), 0, 5)",
    args: [
      { name: "start", type: "number", required: true, defaultValue: "0", description: "Start index (inclusive)" },
      { name: "end", type: "number", required: false, description: "End index (exclusive). Omit to go to the end." },
    ],
  },
  {
    id: "perGroup",
    label: "perGroup",
    category: "utility",
    pipeType: "streams",
    returns: "streams",
    description: "Groups by attribute, keeps up to n per group, interleaves round-robin.",
    example: "perGroup(streams, 'resolution', 3)",
    args: [
      { name: "attribute", type: "string", required: true, options: GROUP_ATTRS, description: "Stream property to group by" },
      // The parser throws unless n is an integer >= 1 (streamExpression.ts:1322).
      { name: "n", type: "number", required: true, defaultValue: "1", min: 1, description: "Max streams to take from each group (1 or more)" },
      { name: "filterValues", type: "string", variadic: true, required: false, freeform: true, description: "Optional group keys to include (all if omitted)" },
    ],
  },
  {
    id: "values",
    label: "values",
    category: "utility",
    pipeType: "streams",
    returns: "numberArray",
    description: "Extracts a numeric property from each stream as an array of numbers.",
    example: "avg(values(streams, 'bitrate'))",
    args: [{ name: "attribute", type: "string", required: true, options: VALUE_ATTRS, description: "Property to extract" }],
  },

  // --- Filter functions --------------------------------------------------
  { id: "indexer", label: "indexer", category: "filter", pipeType: "streams", returns: "streams", description: "Filter by originating indexer name (case-sensitive).", example: "indexer(streams, '1337x', 'RARBG')", args: [{ name: "names", type: "string", variadic: true, required: true, freeform: true, placeholder: "1337x" }] },
  { id: "resolution", label: "resolution", category: "filter", pipeType: "streams", returns: "streams", description: "Filter by video resolution.", example: "resolution(streams, '2160p', '1080p')", args: [{ name: "values", type: "string", variadic: true, required: true, options: RESOLUTIONS }] },
  { id: "quality", label: "quality", category: "filter", pipeType: "streams", returns: "streams", description: "Filter by quality tag.", example: "quality(streams, 'Bluray', 'WEB-DL')", args: [{ name: "values", type: "string", variadic: true, required: true, options: QUALITIES }] },
  { id: "encode", label: "encode", category: "filter", pipeType: "streams", returns: "streams", description: "Filter by video encoding format.", example: "encode(streams, 'H.265', 'HEVC')", args: [{ name: "values", type: "string", variadic: true, required: true, freeform: true, options: ["H.264", "H.265", "HEVC", "x264", "x265", "AV1", "VP9"], placeholder: "H.265" }] },
  { id: "type", label: "type", category: "filter", pipeType: "streams", returns: "streams", description: "Filter by stream type.", example: "type(streams, 'debrid', 'p2p')", args: [{ name: "values", type: "string", variadic: true, required: true, options: STREAM_TYPES }] },
  { id: "visualTag", label: "visualTag", category: "filter", pipeType: "streams", returns: "streams", description: "Filter by visual tag.", example: "visualTag(streams, 'DV', 'HDR')", args: [{ name: "values", type: "string", variadic: true, required: true, freeform: true, options: ["HDR", "DV", "HDR10", "HDR10+", "HLG"], placeholder: "DV" }] },
  { id: "audioTag", label: "audioTag", category: "filter", pipeType: "streams", returns: "streams", description: "Filter by audio format tag.", example: "audioTag(streams, 'Atmos', 'DTS-HD MA')", args: [{ name: "values", type: "string", variadic: true, required: true, freeform: true, options: ["Atmos", "DTS", "DTS-HD MA", "AC3", "EAC3"], placeholder: "Atmos" }] },
  { id: "audioChannels", label: "audioChannels", category: "filter", pipeType: "streams", returns: "streams", description: "Filter by audio channel configuration.", example: "audioChannels(streams, '5.1', '7.1')", args: [{ name: "values", type: "string", variadic: true, required: true, freeform: true, options: ["2.0", "5.1", "7.1"], placeholder: "5.1" }] },
  { id: "language", label: "language", category: "filter", pipeType: "streams", returns: "streams", description: "Filter by audio language.", example: "language(streams, 'English')", args: [{ name: "values", type: "string", variadic: true, required: true, freeform: true, options: ["English", "Spanish", "Japanese", "French", "German"], placeholder: "English" }] },
  { id: "subtitle", label: "subtitle", category: "filter", pipeType: "streams", returns: "streams", description: "Filter by subtitle language. Alias: subtitles.", example: "subtitle(streams, 'English')", args: [{ name: "values", type: "string", variadic: true, required: true, freeform: true, options: ["English", "Spanish", "Japanese", "French", "German"], placeholder: "English" }] },
  { id: "seeders", label: "seeders", category: "filter", pipeType: "streams", returns: "streams", description: "Filter by torrent seeder count. At least one bound is required by SEL; both are asked for here to keep the result always valid.", example: "seeders(streams, 5, 200)", args: [{ name: "min", type: "number", required: true, min: 0, noGreaterThan: "max", description: "Minimum seeders (inclusive)" }, { name: "max", type: "number", required: true, description: "Maximum seeders (inclusive)" }] },
  // The parser throws on a negative bound or on max < min (streamExpression.ts:877).
  { id: "age", label: "age", category: "filter", pipeType: "streams", returns: "streams", description: "Filter by age in hours. At least one bound is required by SEL; both are asked for here to keep the result always valid.", example: "age(streams, 24, 8760)", args: [{ name: "min", type: "number", required: true, min: 0, noGreaterThan: "max", description: "Minimum age in hours" }, { name: "max", type: "number", required: true, min: 0, description: "Maximum age in hours" }] },
  { id: "size", label: "size", category: "filter", pipeType: "streams", returns: "streams", description: "Filter by file size. Human-readable ('1GB') or raw bytes. At least one bound is required by SEL; both are asked for here to keep the result always valid.", example: "size(streams, '1GB', '10GB')", args: [{ name: "min", type: "string", required: true, placeholder: "1GB" }, { name: "max", type: "string", required: true, placeholder: "10GB" }] },
  { id: "bitrate", label: "bitrate", category: "filter", pipeType: "streams", returns: "streams", description: "Filter by bitrate ('5Mbps', '5000kbps', or raw bps). At least one bound is required by SEL; both are asked for here to keep the result always valid.", example: "bitrate(streams, '5Mbps')", args: [{ name: "min", type: "string", required: true, placeholder: "5Mbps" }, { name: "max", type: "string", required: true, placeholder: "20Mbps" }] },
  { id: "service", label: "service", category: "filter", pipeType: "streams", returns: "streams", description: "Filter by Debrid service. Reads stream.service, which is unset for a stream still awaiting Service Wrap resolution (that runs after exit conditions evaluate) -- reliable for streams from addons that resolve debrid directly.", example: "service(streams, 'realdebrid', 'torbox')", args: [{ name: "values", type: "string", variadic: true, required: true, options: SERVICES }] },
  { id: "cached", label: "cached", category: "filter", pipeType: "streams", returns: "streams", description: "Filter for cached Debrid streams only. Reads stream.service, which is unset for a stream still awaiting Service Wrap resolution (that runs after exit conditions evaluate) -- reliable for streams from addons that resolve debrid directly.", example: "cached(streams)", args: [] },
  { id: "uncached", label: "uncached", category: "filter", pipeType: "streams", returns: "streams", description: "Filter for non-cached streams only. Reads stream.service, which is unset for a stream still awaiting Service Wrap resolution (that runs after exit conditions evaluate) -- reliable for streams from addons that resolve debrid directly.", example: "uncached(streams)", args: [] },
  { id: "releaseGroup", label: "releaseGroup", category: "filter", pipeType: "streams", returns: "streams", description: "Filter by release group name. Omit names to match any release group.", example: "releaseGroup(streams, 'YIFY', 'FLUX')", args: [{ name: "names", type: "string", variadic: true, required: false, freeform: true, placeholder: "YIFY" }] },
  { id: "seasonPack", label: "seasonPack", category: "filter", pipeType: "streams", returns: "streams", description: "Filter for season pack streams.", example: "seasonPack(streams, 'seasonPack')", args: [{ name: "mode", type: "string", required: false, options: ["seasonPack", "onlySeasons"], defaultValue: "onlySeasons" }] },
  { id: "multiEpisode", label: "multiEpisode", category: "filter", pipeType: "streams", returns: "streams", description: "Filter for streams containing multiple episodes (not in the official docs, but present in the AIOStreams parser).", example: "multiEpisode(streams, 2)", args: [{ name: "minEpisodes", type: "number", required: false, defaultValue: "2", description: "Minimum episodes contained in the release" }] },
  { id: "addon", label: "addon", category: "filter", pipeType: "streams", returns: "streams", description: "Filter by addon name (case-sensitive).", example: "addon(streams, 'Torrentio', 'Knightcrawler')", args: [{ name: "names", type: "string", variadic: true, required: true, freeform: true, placeholder: "Torrentio" }] },
  { id: "library", label: "library", category: "filter", pipeType: "streams", returns: "streams", description: "Filter for streams from a personal Debrid library. Reads stream.library, which is unset for a stream still awaiting Service Wrap resolution (that runs after exit conditions evaluate) -- reliable for streams from addons that resolve debrid directly.", example: "library(streams)", args: [] },
  { id: "idMatched", label: "idMatched", category: "filter", pipeType: "streams", returns: "streams", description: "Filter for streams identified by external ID rather than title search.", example: "idMatched(streams)", args: [] },
  { id: "message", label: "message", category: "filter", pipeType: "streams", returns: "streams", description: "Filter by a stream's message property.", example: "message(streams, 'includes', 'cached')", args: [{ name: "mode", type: "string", required: true, options: ["exact", "includes"], defaultValue: "includes" }, { name: "messages", type: "string", variadic: true, required: true, freeform: true, placeholder: "cached" }] },
  { id: "seadex", label: "seadex", category: "filter", pipeType: "streams", returns: "streams", description: "Filter for SeaDex-listed streams (best anime releases).", example: "seadex(streams, 'best')", args: [{ name: "type", type: "string", required: false, options: ["best", "alt", "all"], defaultValue: "all" }, { name: "method", type: "string", required: false, options: ["hash", "group"] }] },
  { id: "keyword", label: "keyword", category: "filter", pipeType: "streams", returns: "streams", description: "Filter by one or more keywords against chosen attributes. Alias: keywords.", example: "keyword(streams, 'filename', 'remux')", args: [{ name: "attributes", type: "string", required: true, options: KEYWORD_ATTRS, defaultValue: "all" }, { name: "keywords", type: "string", variadic: true, required: true, freeform: true, placeholder: "remux" }] },
  { id: "regexMatched", label: "regexMatched", category: "filter", pipeType: "streams", returns: "streams", description: "Filter for streams that matched a preferred or ranked regex filter.", example: "regexMatched(streams, 'HighQuality')", args: [{ name: "names", type: "string", variadic: true, required: false, freeform: true, placeholder: "HighQuality" }] },
  { id: "regexMatchedInRange", label: "regexMatchedInRange", category: "filter", pipeType: "streams", returns: "streams", description: "Filter where the matched regex filter's index is within [min, max].", example: "regexMatchedInRange(streams, 0, 5)", args: [{ name: "min", type: "number", required: true, defaultValue: "0", min: 0, noGreaterThan: "max" }, { name: "max", type: "number", required: true, defaultValue: "5" }] },
  { id: "seMatched", label: "seMatched", category: "filter", pipeType: "streams", returns: "streams", description: "Filter for streams that matched a preferred Stream Expression.", example: "seMatched(streams, '4K', 'Anime HQ')", args: [{ name: "names", type: "string", variadic: true, required: false, freeform: true, placeholder: "4K" }] },
  { id: "seMatchedInRange", label: "seMatchedInRange", category: "filter", pipeType: "streams", returns: "streams", description: "Filter where the matched preferred Stream Expression index is within [min, max].", example: "seMatchedInRange(streams, 0, 3)", args: [{ name: "min", type: "number", required: true, defaultValue: "0", min: 0, noGreaterThan: "max" }, { name: "max", type: "number", required: true, defaultValue: "3" }] },
  { id: "rseMatched", label: "rseMatched", category: "filter", pipeType: "streams", returns: "streams", description: "Filter for streams that matched one or more ranked Stream Expressions.", example: "rseMatched(streams, 'BD T1', 'Web T1')", args: [{ name: "names", type: "string", variadic: true, required: false, freeform: true, placeholder: "BD T1" }] },
  { id: "streamExpressionScore", label: "streamExpressionScore", category: "filter", pipeType: "streams", returns: "streams", description: "Filter by Ranked Stream Expression score (streams with no score are excluded). Alias: seScore. Both bounds are asked for here to keep the result always valid.", example: "streamExpressionScore(streams, 100, 500)", args: [{ name: "min", type: "number", required: true, defaultValue: "100", noGreaterThan: "max" }, { name: "max", type: "number", required: true, defaultValue: "500" }] },
  { id: "regexScore", label: "regexScore", category: "filter", pipeType: "streams", returns: "streams", description: "Filter by Ranked Regex score (streams with no score are excluded). Both bounds are asked for here to keep the result always valid.", example: "regexScore(streams, 0, 500)", args: [{ name: "min", type: "number", required: true, defaultValue: "0", min: 0, noGreaterThan: "max" }, { name: "max", type: "number", required: true, defaultValue: "500" }] },
  { id: "passthrough", label: "passthrough", category: "filter", pipeType: "streams", returns: "streams", description: "Flags streams to bypass specific pipeline stages. Omit stages to bypass all.", example: "passthrough(idMatched(streams), 'title', 'year')", args: [{ name: "stages", type: "string", variadic: true, required: false, options: PASSTHROUGH_STAGES }] },
  // pin() omitted: no effect in exit conditions (see file-header note above).

  // count() takes a stream list directly, unlike every math function below which needs values() first.
  {
    id: "count",
    label: "count",
    category: "math",
    pipeType: "streams",
    returns: "number",
    description: "Number of streams in the list.",
    example: "count(resolution(cached(streams), '2160p'))",
    args: [],
  },

  // --- Math functions (operate on values() output) ------------------------
  ...([
    ["max", "Largest value"],
    ["min", "Smallest value"],
    ["avg", "Arithmetic mean (alias: mean)"],
    ["sum", "Sum of all values"],
    ["median", "Middle value / 50th percentile (alias: q2)"],
    ["mode", "Most frequently occurring value"],
    ["range", "max - min"],
    ["variance", "Spread from the average"],
    ["stddev", "Standard deviation"],
    ["q1", "First quartile (25th percentile)"],
    ["q3", "Third quartile (75th percentile)"],
    ["iqr", "Interquartile range (q3 - q1)"],
    ["skewness", "Asymmetry of the distribution"],
    ["kurtosis", '"Tailedness" of the distribution'],
  ] as const).map(
    ([id, description]): SelFunction => ({
      id,
      label: id,
      category: "math",
      pipeType: "numberArray",
      returns: "number",
      description,
      example: `${id}(values(streams, 'bitrate'))`,
      args: [],
    }),
  ),
  {
    id: "percentile",
    label: "percentile",
    category: "math",
    pipeType: "numberArray",
    returns: "number",
    description: "Value below which p% of observations fall.",
    example: "percentile(values(streams, 'bitrate'), 90)",
    // The parser throws outside 0-100 (streamExpression.ts:231).
    args: [{ name: "p", type: "number", required: true, defaultValue: "90", min: 0, max: 100, description: "Percentile (0-100)" }],
  },
];

export function getFunction(id: string): SelFunction {
  const fn = FUNCTIONS.find((f) => f.id === id);
  if (!fn) throw new Error(`Unknown SEL function: ${id}`);
  return fn;
}

export function functionsForPipeType(type: SelValueType): SelFunction[] {
  return FUNCTIONS.filter((f) => f.pipeType === type);
}

/** Every type a chain from `from` can reach via catalog functions - lets a number-restricted
 * picker offer totalStreams too, since count() gets it there. */
export function reachableTypes(from: SelValueType): Set<SelValueType> {
  const seen = new Set<SelValueType>([from]);
  const queue: SelValueType[] = [from];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const fn of FUNCTIONS) {
      if (fn.pipeType === current && !seen.has(fn.returns)) {
        seen.add(fn.returns);
        queue.push(fn.returns);
      }
    }
  }
  return seen;
}

/** `includes` has no SEL operator of its own: it compiles to `in` with the operands swapped, so
 * the list can stay on the left where you picked it. */
export type ComparisonOp = "==" | "!=" | ">" | "<" | ">=" | "<=" | "in" | "includes";
export type ArithmeticOp = "+" | "-" | "*" | "/";

/** `label` is the SEL spelling; `plain` is how the control reads it aloud. */
export const COMPARISON_OPS: { id: ComparisonOp; label: string; plain: string; description: string }[] = [
  { id: "==", label: "==", plain: "is", description: "Equal" },
  { id: "!=", label: "!=", plain: "isn't", description: "Not equal" },
  { id: ">", label: ">", plain: "is more than", description: "Greater than" },
  { id: "<", label: "<", plain: "is less than", description: "Less than" },
  { id: ">=", label: ">=", plain: "is at least", description: "Greater than or equal" },
  { id: "<=", label: "<=", plain: "is at most", description: "Less than or equal" },
  { id: "in", label: "in", plain: "is one of", description: "Value exists in the list" },
  { id: "includes", label: "includes", plain: "contains", description: "The list contains this value" },
];

export const ARITHMETIC_OPS: { id: ArithmeticOp; label: string }[] = [
  { id: "+", label: "+" },
  { id: "-", label: "-" },
  { id: "*", label: "*" },
  { id: "/", label: "/" },
];
