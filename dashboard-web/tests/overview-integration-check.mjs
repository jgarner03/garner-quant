import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { performanceGapRegions } from "../lib/performanceGaps.ts";

const integration = readFileSync("components/OverviewIntegration.tsx", "utf8");
const client = readFileSync("components/DashboardClient.tsx", "utf8");
const proxy = readFileSync("app/api/overview/route.ts", "utf8");
const overviewApi = readFileSync("../dashboard-api/app/overview.py", "utf8");

if (!integration.includes('fetch("/api/overview"')) throw new Error("Overview browser request must use the same-origin proxy");
if (!integration.includes('kind: "fallback"') || !integration.includes("Mock fallback")) throw new Error("Overview must retain its fail-closed fallback contract");
if (!integration.includes("no snapshot and mock values are combined")) throw new Error("Overview must not mix API and mock fields");
if (!integration.includes("Live local snapshot") || !integration.includes("Portfolio data as of") || !integration.includes("Loaded")) throw new Error("Overview must distinguish source and response timestamps");
if (!integration.includes("Stale snapshot") || !integration.includes("Latest recorded change")) throw new Error("Overview must present deterministic staleness and recorded-change provenance");
if (!integration.includes("snapshot_age_seconds") || integration.includes("Date.now")) throw new Error("Overview staleness must use API-provided age only");
if (!integration.includes("performanceDomain") || !integration.includes("displayCompactMoney") || !integration.includes("monthlyTicks") || !integration.includes("labelFormatter") || !integration.includes("formatter={(value")) throw new Error("Portfolio chart must use rounded GBP ticks, monthly date ticks, and exact tooltip formatting");
if (!integration.includes("Holdings have inconsistent timestamps") || integration.includes("description={data.allocation.availability.reason")) throw new Error("Overview allocation message must be human-readable");
if (!integration.includes("allocationAvailable") || !integration.includes("<Pie") || !integration.includes("data={allocation}")) throw new Error("Overview must render validated allocation items");
if (!integration.includes("holdingsAvailable") || !integration.includes("data.holdings_summary.holdings.map")) throw new Error("Overview must render validated holdings");
if (!integration.includes("Cash source not configured")) throw new Error("Overview must explain unavailable cash");
if (!integration.includes("Risk configuration not connected")) throw new Error("Overview must explain unavailable risk configuration");
if (!integration.includes("Data discontinuity marked") || !integration.includes("No values are interpolated")) throw new Error("Overview must disclose performance-series gaps");
if (integration.includes("<ReferenceArea") || integration.includes("<ReferenceLine")) throw new Error("Overview must not render a performance-gap chart overlay");
const liveGapRegions = performanceGapRegions([
  "2026-07-15", "2026-07-16", "2026-08-13", "2026-08-14", "2026-08-20", "2026-08-22", "2026-08-29", "2026-09-01", "2026-09-03", "2026-09-09", "2026-09-11", "2026-09-22",
].map(sourceAsOf => ({ sourceAsOf: `${sourceAsOf}T00:00:00Z` })));
assert.equal(liveGapRegions.length, 1, "live Overview data must render one gap region");
assert.equal(liveGapRegions[0].from, "2026-07-16T00:00:00Z");
assert.equal(liveGapRegions[0].to, "2026-08-13T00:00:00Z");
if (!overviewApi.includes("load_trading_performance") || !overviewApi.includes('row["status"] == "RECORDED"') || !overviewApi.includes('row["action"] == "BUY"')) throw new Error("Overview performance must be bounded by the authoritative recorded ledger start");
if (!overviewApi.includes('reconciliation["starting_cash"]') || !overviewApi.includes('paper_30_day_tracker.csv')) throw new Error("Overview performance must use the reconciled opening value and recorded tracker equity");
const ledgerRows = readFileSync("../trade_ledger_v1.csv", "utf8").trim().split(/\r?\n/);
const ledgerHeader = ledgerRows[0].split(",");
const ledgerRecords = ledgerRows.slice(1).map(row => Object.fromEntries(row.split(",").map((value, index) => [ledgerHeader[index], value])));
const tradingStart = ledgerRecords.filter(row => row.status === "RECORDED" && row.action === "BUY").map(row => row.timestamp).sort()[0];
assert.equal(tradingStart.slice(0, 10), "2026-06-24", "chart must begin at the authoritative ledger trading start");
assert.equal(JSON.parse(readFileSync("../data/accounting_reconciliation_report.json", "utf8")).starting_cash, 10000, "chart opening equity must use the reconciled opening value");
assert.ok(tradingStart > "2025-08-31", "earlier August 2025 portfolio rows must not enter the trading-period chart");
if (!integration.includes("Risk configuration files are not connected to the dashboard.")) throw new Error("Overview must sanitize risk warning paths");
if (!integration.includes("Signals last updated") || !integration.includes("formatDate(signalAsOf)")) throw new Error("Overview must show the observed signal date");
if (integration.includes('? "Partial"')) throw new Error("Overview must use section-level availability instead of a broad Partial label");
if (!proxy.includes("DASHBOARD_API_URL") || !proxy.includes("/api/v1/overview")) throw new Error("Overview proxy is not server-only");
if (!client.includes("Overview: <OverviewIntegration fallback={null} />")) throw new Error("Overview must use the integration component");
const header = readFileSync("components/Header.tsx", "utf8");
if (!header.includes("Preview UI") || !header.includes("Monitor only") || header.includes("Local mock") || header.includes("11 Aug 2026")) throw new Error("Global header status indicators are incorrect");

console.log("Overview integration checks passed");
