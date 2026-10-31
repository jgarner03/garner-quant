"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/ChartCard";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { OverviewApiResponse, isOverviewApiResponse } from "@/lib/overviewApi";
import { performanceGapRegions } from "@/lib/performanceGaps";
import { toneClass } from "@/lib/dashboard";

const grid = <CartesianGrid stroke="#243640" vertical={false} />;
const axis = {
  stroke: "#8a9ba5",
  fontSize: 13,
  tickLine: false,
  axisLine: false,
};
const tooltip = {
  contentStyle: {
    background: "#111c24",
    border: "1px solid #405761",
    borderRadius: "8px",
    fontSize: 14,
  },
  labelStyle: { color: "#e2e8f0" },
};

function displayMoney(value: string | null) {
  return value === null
    ? "Unavailable"
    : `GBP ${Number(value).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function displayCompactMoney(value: number) {
  return Number.isFinite(value)
    ? Math.abs(value) >= 1000
      ? `£${(value / 1000).toFixed(1)}k`
      : `£${value.toFixed(0)}`
    : "—";
}
function displayPercent(value: string | null) {
  return value === null
    ? "Unavailable"
    : `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(2)}%`;
}
function formatUtc(value: string | null) {
  return value
    ? `${new Date(value).toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" })} UTC`
    : "Unavailable";
}
function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
function formatShortDate(value: string | null) {
  return value
    ? new Date(value).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" })
    : "No timestamp";
}
function chartLabel(time: number) {
  const date = new Date(time);
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getUTCMonth()];
  return date.getUTCMonth() === 0 ? `${month} ’${date.getUTCFullYear().toString().slice(-2)}` : month;
}
// Rounded y-axis bounds and ticks so labels land on readable £ values.
function performanceDomain(values: number[]): { domain: [number, number]; ticks: number[] } | null {
  const observed = values.filter(Number.isFinite);
  if (!observed.length) return null;
  const low = Math.min(...observed);
  const high = Math.max(...observed);
  const rawStep = Math.max(high - low, Math.abs(high) * 0.02, 1) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= rawStep) ?? rawStep;
  const start = Math.floor(low / step) * step;
  const end = Math.ceil(high / step) * step;
  const ticks = Array.from({ length: Math.round((end - start) / step) + 1 }, (_, index) => start + index * step);
  return { domain: [start, end], ticks };
}
// One tick at the start of each UTC month inside the observed range.
function monthlyTicks(startTime: number, endTime: number) {
  const ticks: number[] = [];
  const cursor = new Date(startTime);
  cursor.setUTCDate(1);
  cursor.setUTCHours(0, 0, 0, 0);
  cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  while (cursor.getTime() <= endTime) {
    ticks.push(cursor.getTime());
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return ticks.length >= 2 ? ticks : [startTime, endTime];
}
function signedTone(value: string | null) {
  if (value === null || !Number.isFinite(Number(value))) return "text-slate-500";
  return toneClass(Number(value) >= 0 ? "positive" : "negative");
}
function OverviewKpi({
  label,
  value,
  valueClass,
  meta,
  stale,
  details,
}: {
  label: string;
  value: string;
  valueClass: string;
  meta: string;
  stale: boolean;
  details: string;
}) {
  return (
    <div className="rounded-xl border border-slate-700/70 bg-[#111c24] p-5" title={details}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-slate-400">{label}</span>
        {stale ? (
          <span className="rounded border border-amber/30 bg-amber/10 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-amber">
            Stale
          </span>
        ) : null}
      </div>
      <div className={`mt-2 text-[28px] font-semibold leading-tight tracking-tight tabular-nums ${valueClass}`}>{value}</div>
      <div className="mt-1.5 text-[13px] text-slate-500">{meta}</div>
    </div>
  );
}
export function OverviewIntegration({
  fallback,
}: {
  fallback: React.ReactNode;
}) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "api"; data: OverviewApiResponse }
    | { kind: "fallback" }
  >({ kind: "loading" });

  useEffect(() => {
    let active = true;
    fetch("/api/overview", { cache: "no-store" })
      .then(async (response) => ({
        ok: response.ok,
        body: await response.json(),
      }))
      .then(
        (result) =>
          active &&
          setState(
            result.ok && isOverviewApiResponse(result.body)
              ? { kind: "api", data: result.body }
              : { kind: "fallback" },
          ),
      )
      .catch(() => active && setState({ kind: "fallback" }));
    return () => {
      active = false;
    };
  }, []);

  if (state.kind === "loading") return <LoadingSkeleton />;
  // Keep the fallback state name for the integration contract; a failed API must never render a Mock fallback or any supplied demo values. The local snapshot is unavailable; no snapshot and mock values are combined.
  if (state.kind === "fallback")
    return (
      <ErrorState
        title="Overview data unavailable"
        description="The read-only overview source could not be loaded. No snapshot and mock values are combined; operator action: restore the validated mounted sources."
      />
    );

  const { data } = state;
  const fresh = data.snapshot_freshness.status === "fresh";
  const performanceAvailability = data.performance_series.availability.availability;
  const performanceAvailable =
    performanceAvailability === "available" || performanceAvailability === "partial";
  const points = performanceAvailable
    ? data.performance_series.items
        .map((item, index) => ({
          index,
          sourceAsOf: item.as_of_utc,
          sourceTime: new Date(item.as_of_utc).getTime(),
          portfolio: Number(item.equity),
        }))
        .filter((point) => Number.isFinite(point.portfolio))
    : [];
  const yScale = performanceDomain(points.map((point) => point.portfolio));
  const xTicks = points.length ? monthlyTicks(points[0].sourceTime, points.at(-1)?.sourceTime ?? points[0].sourceTime) : [];
  const discontinuities = performanceGapRegions(points);
  const allocationAvailable =
    data.allocation.availability.availability === "available" &&
    data.allocation.items.length > 0;
  const holdingsAvailable =
    data.holdings_summary.availability.availability === "available" &&
    data.holdings_summary.holdings.length > 0;
  const allocation = data.allocation.items
    .map((item, index) => ({
      ...item,
      value: Number(item.weight_percent),
      colour: [
        "#72c59a",
        "#8fb8d8",
        "#d7b46a",
        "#b79adb",
        "#da8f8f",
        "#77bfc1",
      ][index % 6],
    }))
    .filter((item) => Number.isFinite(item.value));
  const allocationMessage = data.allocation.availability.reason?.includes(
    "inconsistent timestamps",
  )
    ? "Holdings have inconsistent timestamps"
    : "Allocation is unavailable from this snapshot.";
  const safetyItems = [
    ["Runtime", data.risk_safety_summary.mode],
    ["Paper execution", data.risk_safety_summary.paper_execution_enabled],
    ["Trading", data.risk_safety_summary.trading_enabled],
    ["Limits approved", data.risk_safety_summary.limits_approved],
  ] as const;
  const riskAvailable = safetyItems.some(
    ([, item]) =>
      item.value !== null && item.availability.availability === "available",
  );
  const signalAsOf = data.recent_signals.items[0]?.as_of_utc;
  const visibleWarnings = Array.from(
    new Set(
      data.warnings.map((warning) =>
        /(?:live_runtime_config|risk_config)\.json/i.test(warning)
          ? "Risk configuration files are not connected to the dashboard."
          : warning,
      ),
    ),
  );
  const ageDays =
    data.snapshot_freshness.snapshot_age_seconds === null
      ? null
      : Math.floor(data.snapshot_freshness.snapshot_age_seconds / 86400);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-400">
        <StatusBadge label="Live local snapshot" tone="neutral" />
        <span>Portfolio data as of {formatUtc(data.source_as_of_utc)}</span>
        <span aria-hidden>·</span>
        <span>Loaded {formatUtc(data.generated_at_utc)}</span>
        {data.snapshot_freshness.status === "stale" && ageDays !== null ? (
          <span className="rounded-md border border-amber/30 bg-amber/10 px-2 py-0.5 text-amber">
            Stale snapshot — portfolio data is {ageDays} days old
          </span>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Portfolio Value",
            value: displayMoney(data.portfolio_summary.portfolio_value),
            valueClass: data.portfolio_summary.portfolio_value === null ? "text-slate-500" : "text-slate-100",
            meta: `As of ${formatShortDate(data.source_as_of_utc)}`,
            stale: !fresh,
            details: `Source: portfolio snapshot; UTC: ${formatUtc(data.source_as_of_utc)}; Definition: latest observed equity; Severity: ${fresh ? "observed" : "stale"}; Operator action: ${fresh ? "none" : "refresh and validate the mounted snapshot."}`,
          },
          {
            label: "Latest recorded change",
            value: displayPercent(data.portfolio_summary.daily_change_percent),
            valueClass: signedTone(data.portfolio_summary.daily_change_percent),
            meta: `Recorded ${formatShortDate(data.portfolio_summary.latest_recorded_change_as_of_utc)}`,
            stale: !fresh,
            details: `Source: portfolio snapshot; UTC: ${formatUtc(data.portfolio_summary.latest_recorded_change_as_of_utc)}; Definition: observed recorded daily change; Severity: ${fresh ? "observed" : "stale"}; Operator action: ${fresh ? "none" : "refresh and validate the mounted snapshot."}`,
          },
          {
            label: "Total Return",
            value: displayPercent(data.portfolio_summary.total_return_percent),
            valueClass: signedTone(data.portfolio_summary.total_return_percent),
            meta: "First to latest observed equity",
            stale: !fresh,
            details: `Source: portfolio snapshot; UTC: ${formatUtc(data.source_as_of_utc)}; Definition: derived change from first to latest observed equity; Severity: ${fresh ? "derived" : "stale"}; Operator action: ${fresh ? "none" : "refresh and validate the mounted snapshot."}`,
          },
          {
            label: "Cash",
            value: "Unavailable",
            valueClass: "text-slate-500",
            meta: "Cash source not configured",
            stale: false,
            details:
              "Source: no explicit cash artifact; UTC: no timestamp; Definition: cash balance; Severity: unavailable; Operator action: mount a timestamp-matched cash source.",
          },
        ].map((item) => (
          <OverviewKpi key={item.label} {...item} />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(300px,.8fr)]">
        <ChartCard
          title="Portfolio performance"
          subtitle="Equity since the first recorded trade · benchmark unavailable from mounted sources"
        >
          <div className="h-[340px]">
            {points.length && yScale ? (
              <ResponsiveContainer>
                <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="overviewEquityFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#72c59a" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#72c59a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  {grid}
                  <XAxis
                    dataKey="sourceTime"
                    type="number"
                    scale="time"
                    domain={[points[0].sourceTime, points.at(-1)?.sourceTime ?? points[0].sourceTime]}
                    ticks={xTicks}
                    tickFormatter={(value) => chartLabel(Number(value))}
                    tickMargin={10}
                    {...axis}
                  />
                  <YAxis
                    {...axis}
                    width={56}
                    domain={yScale.domain}
                    ticks={yScale.ticks}
                    tickFormatter={displayCompactMoney}
                  />
                  <Tooltip
                    {...tooltip}
                    cursor={{ stroke: "#405761", strokeDasharray: "3 3" }}
                    labelFormatter={(value) =>
                      formatUtc(new Date(Number(value)).toISOString())
                    }
                    formatter={(value: number | string) => [
                      displayMoney(String(value)),
                      "Portfolio",
                    ]}
                  />
                  <Area
                    type="linear"
                    dataKey="portfolio"
                    name="Portfolio"
                    stroke="#72c59a"
                    strokeWidth={2}
                    fill="url(#overviewEquityFill)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                title="Performance unavailable"
                description={
                  data.performance_series.availability.reason ||
                  "The local portfolio series could not be validated."
                }
              />
            )}
          </div>
          {points.length ? (
            <p className="mt-3 text-[13px] text-slate-500">
              {performanceAvailability === "partial" ? (
                <span className="text-amber">
                  Partial series:{" "}
                  {(data.performance_series.availability.reason ?? "some recorded rows were excluded").replace(
                    /^authoritative trading performance: /,
                    "",
                  )}
                  {" · "}
                </span>
              ) : null}
              {discontinuities.length ? (
                <span className="text-amber">
                  Data discontinuity marked: {discontinuities.length} gap
                  {discontinuities.length === 1 ? "" : "s"}; largest{" "}
                  {Math.max(...discontinuities.map((gap) => gap.gapDays))} days from{" "}
                  {formatDate(
                    discontinuities.reduce((largest, gap) =>
                      gap.gapDays > largest.gapDays ? gap : largest,
                    ).from,
                  )}
                  . No values are interpolated.
                </span>
              ) : (
                <span>No gaps of 14+ days.</span>
              )}
            </p>
          ) : null}
        </ChartCard>
        <div className="space-y-5">
          <ChartCard title="Allocation">
            {allocationAvailable &&
            allocation.length === data.allocation.items.length ? (
              <div className="grid items-center gap-2 sm:grid-cols-[1fr_160px]">
                <div className="h-[280px]">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={allocation}
                        dataKey="value"
                        nameKey="instrument"
                        innerRadius="62%"
                        outerRadius="92%"
                      >
                        {allocation.map((item) => (
                          <Cell key={item.instrument} fill={item.colour} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => `${value.toFixed(2)}%`}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3 text-[15px]">
                  {allocation.map((item) => (
                    <div
                      key={item.instrument}
                      className="flex items-center justify-between gap-2 text-slate-300"
                    >
                      <span>{item.instrument}</span>
                      <b className="tabular-nums text-slate-100">
                        {item.value.toFixed(2)}%
                      </b>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState
                title="Allocation unavailable"
                description={allocationMessage}
              />
            )}
          </ChartCard>
          <ChartCard title="Risk summary">
            {riskAvailable ? (
              <div className="space-y-3">
                {safetyItems.map(([label, item]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between text-[15px]"
                  >
                    <span className="text-slate-300">{label}</span>
                    <span className="text-slate-100">
                      {item.value ?? "Unavailable"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Risk configuration not connected"
                description="live_runtime_config.json and risk_config.json are not available to the dashboard API."
              />
            )}
          </ChartCard>
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <ChartCard
          title="Recent signals"
          actions={signalAsOf ? <span className="rounded-md border border-amber/30 bg-amber/10 px-2.5 py-1 text-xs text-amber">Signals last updated {formatDate(signalAsOf)}</span> : undefined}
        >
          <div className="divide-y divide-slate-700/60">
            {data.recent_signals.items.length ? (
              data.recent_signals.items.map((item) => (
                <div
                  key={item.instrument}
                  className="flex items-center justify-between py-3.5"
                >
                  <div>
                    <b className="text-base">{item.instrument}</b>
                    <p className="text-[15px] text-slate-300">
                      Target weight {Number(item.target_weight).toFixed(2)}
                    </p>
                  </div>
                  <StatusBadge label={item.status} tone="neutral" />
                </div>
              ))
            ) : (
              <EmptyState
                title="Signals unavailable"
                description={
                  data.recent_signals.availability.reason ||
                  "No validated signal snapshot is available."
                }
              />
            )}
          </div>
        </ChartCard>
        <ChartCard title="Current holdings">
          {holdingsAvailable ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400">
                    <th className="py-3">Instrument</th>
                    <th className="py-3 text-right">Quantity</th>
                    <th className="py-3 text-right">Market value</th>
                  </tr>
                </thead>
                <tbody>
                  {data.holdings_summary.holdings.map((row) => (
                    <tr
                      key={row.instrument}
                      className="border-b border-slate-800"
                    >
                      <td className="py-3 font-medium text-slate-100">
                        {row.instrument}
                      </td>
                      <td className="py-3 text-right tabular-nums text-slate-300">
                        {row.quantity}
                      </td>
                      <td className="py-3 text-right tabular-nums text-slate-100">
                        {displayMoney(row.market_value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="Holdings unavailable"
              description={
                data.holdings_summary.availability.reason ||
                "No internally consistent holdings snapshot is available."
              }
            />
          )}
        </ChartCard>
      </div>
      {visibleWarnings.length ? (
        <p className="text-[14px] text-slate-400">
          Section warnings: {visibleWarnings.join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
