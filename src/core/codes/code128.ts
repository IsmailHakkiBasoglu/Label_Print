import { widthsToModules, type CodeError, type CodeMatrix } from "./index";

/** Bar and space widths of symbol values 0–105, and the stop symbol. */
const PATTERNS = (
  "212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 " +
  "123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 " +
  "232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 " +
  "313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 " +
  "111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 " +
  "111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 " +
  "114311 411113 411311 113141 114131 311141 411131 211412 211214 211232"
).split(" ");
const STOP_PATTERN = "2331112";
const [CODE_C, CODE_B, START_B, START_C, STOP] = [99, 100, 104, 105, 106];
const MAX_LENGTH = 80;
/** Digit runs this long are packed two digits per symbol (set C). */
const MIN_DIGIT_RUN = 4;

/** Symbol values from start to stop, including the check symbol. Set B for text, set C for runs of digits. */
export function code128Values(value: string): number[] | CodeError {
  if (value.length > MAX_LENGTH) return { error: `Code 128 en fazla ${MAX_LENGTH} karakter alır.` };
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    if (code > 126) return { error: `Code 128 "${ch}" gibi Türkçe harfleri kodlayamaz; QR kullanın.` };
    if (code < 32) return { error: "Code 128 satır sonu ve sekme kodlayamaz." };
  }
  const values: number[] = [];
  let set: "B" | "C" | null = null;
  const use = (next: "B" | "C") => {
    if (set === next) return;
    values.push(set === null ? (next === "B" ? START_B : START_C) : next === "B" ? CODE_B : CODE_C);
    set = next;
  };
  const inB = (text: string) => {
    use("B");
    for (const ch of text) values.push(ch.charCodeAt(0) - 32);
  };
  for (const run of value.match(/\d+|\D+/g) ?? []) {
    if (!/^\d/.test(run) || run.length < MIN_DIGIT_RUN) {
      inB(run);
      continue;
    }
    // An odd run leaves its first digit in set B, so set C gets whole pairs.
    if (run.length % 2 === 1) inB(run[0]);
    use("C");
    for (let i = run.length % 2; i < run.length; i += 2) values.push(Number(run.slice(i, i + 2)));
  }
  const check = values.reduce((sum, v, i) => sum + v * Math.max(i, 1), 0) % 103;
  return [...values, check, STOP];
}

export function encodeCode128(value: string): CodeMatrix | CodeError {
  const values = code128Values(value);
  if (!Array.isArray(values)) return values;
  const modules = values.flatMap((v) => widthsToModules(v === STOP ? STOP_PATTERN : PATTERNS[v]));
  return { modules: [modules], quiet: 10, text: value };
}
