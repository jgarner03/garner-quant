const DAY_MS = 86_400_000;
const MATERIAL_GAP_DAYS = 14;

interface PerformanceGapRegion {
  from: string;
  to: string;
  fromTime: number;
  toTime: number;
  gapDays: number;
}

function performanceGapRegions(points: Array<{ sourceAsOf: string }>): PerformanceGapRegion[] {
  const candidates = points.flatMap((point, index) => {
    if (index === 0) return [];
    const from = points[index - 1].sourceAsOf;
    const to = point.sourceAsOf;
    const fromTime = new Date(from).getTime();
    const toTime = new Date(to).getTime();
    const gapDays = (toTime - fromTime) / DAY_MS;
    return Number.isFinite(gapDays) && gapDays >= MATERIAL_GAP_DAYS
      ? [{ from, to, fromTime, toTime, gapDays: Math.round(gapDays) }]
      : [];
  });

  return candidates.reduce<PerformanceGapRegion[]>((regions, gap) => {
    const previous = regions.at(-1);
    if (previous && gap.fromTime <= previous.toTime + DAY_MS) {
      previous.to = gap.to;
      previous.toTime = gap.toTime;
      previous.gapDays = Math.round((previous.toTime - previous.fromTime) / DAY_MS);
      return regions;
    }
    regions.push({ ...gap });
    return regions;
  }, []);
}

export { performanceGapRegions };
