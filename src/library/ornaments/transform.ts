/** Affine matrix [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = [number, number, number, number, number, number];

export const translate = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];
export const scale = (x: number, y: number): Matrix => [x, 0, 0, y, 0, 0];

export function rotate(degrees: number): Matrix {
  const radians = (degrees * Math.PI) / 180;
  const [cos, sin] = [Math.cos(radians), Math.sin(radians)];
  return [cos, sin, -sin, cos, 0, 0];
}

/** The rightmost matrix applies first. */
export function compose(...matrices: Matrix[]): Matrix {
  return matrices.reduce(([a, b, c, d, e, f], [g, h, i, j, k, l]) => [a * g + c * h, b * g + d * h, a * i + c * j, b * i + d * j, a * k + c * l + e, b * k + d * l + f]);
}

function format(n: number): string {
  const value = Math.round(n * 10000) / 10000;
  return String(value === 0 ? 0 : value);
}

/** Rewrites absolute M, L, C, Z path data. Other commands are refused because arcs do not survive a general transform. */
export function transformPath(d: string, [a, b, c, e, f, g]: Matrix): string {
  const commands = d.match(/[a-zA-Z][^a-zA-Z]*/g) ?? [];
  return commands
    .map((chunk) => {
      const command = chunk[0];
      if (!"MLCZ".includes(command)) throw new Error(`Desteklenmeyen yol komutu: ${command}`);
      const numbers = (chunk.slice(1).match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number);
      const out: string[] = [];
      for (let i = 0; i + 1 < numbers.length; i += 2) out.push(`${format(a * numbers[i] + c * numbers[i + 1] + f)} ${format(b * numbers[i] + e * numbers[i + 1] + g)}`);
      return command + out.join(" ");
    })
    .join("");
}
