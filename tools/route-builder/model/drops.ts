export function killsForItems(needed: number, chance: number, quantile: number): number {
  if (!Number.isInteger(needed) || needed < 1) throw new Error(`needed must be a positive integer, got ${needed}`);
  if (!(chance > 0 && chance <= 1)) throw new Error(`chance must be in (0, 1], got ${chance}`);
  if (!(quantile > 0 && quantile < 1)) throw new Error(`quantile must be in (0, 1), got ${quantile}`);
  if (chance === 1) return needed;
  // P(X < needed) over n trials, X ~ Binomial(n, chance), via pmf recurrence.
  for (let n = needed; ; n++) {
    let pmf = (1 - chance) ** n;
    let below = pmf;
    for (let k = 1; k < needed; k++) {
      pmf *= ((n - k + 1) / k) * (chance / (1 - chance));
      below += pmf;
    }
    if (1 - below >= quantile) return n;
  }
}
