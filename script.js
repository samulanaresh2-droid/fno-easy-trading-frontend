
const API_URL = "https://fno-easy-trading-backend-node.onrender.com/api/market";
const REFRESH_MS = 30000;

const $ = id => document.getElementById(id);

function getValue(obj, paths) {
  for (const path of paths) {
    let value = obj;
    for (const key of path.split(".")) {
      value = value?.[key];
    }
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return null;
}

function fmt(value) {
  if (value === null || value === undefined || value === "") return "--";
  const n = Number(value);
  return Number.isFinite(n)
    ? n.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    : "--";
}

function put(id, value) {
  const el = $(id);
  if (el) el.textContent = value ?? "--";
}

function setTag(id, trend) {
  const el = $(id);
  if (!el) return;

  el.textContent = trend;
  el.className = "tag " +
    (trend === "BULLISH" ? "bull" :
     trend === "BEARISH" ? "bear" :
     trend === "SIDEWAYS" ? "side" : "wait");
}

function getTrend(d) {
  const supplied = getValue(d, [
    "trend.trend",
    "trend.direction",
    "trend.marketTrend",
    "marketTrend",
    "direction"
  ]);

  if (typeof supplied === "string") {
    const s = supplied.toUpperCase();

    if (s.includes("BULL")) return "BULLISH";
    if (s.includes("BEAR")) return "BEARISH";
    if (s.includes("SIDE")) return "SIDEWAYS";
  }

  const ema20 = Number(getValue(d, [
    "trend.ema20",
    "indicators.ema20",
    "ema20"
  ]));

  const ema50 = Number(getValue(d, [
    "trend.ema50",
    "indicators.ema50",
    "ema50"
  ]));

  const price = Number(getValue(d, [
    "trend.lastCompletedClose",
    "price",
    "ltp",
    "lastPrice",
    "spot",
    "close"
  ]));

  if (![ema20, ema50, price].every(Number.isFinite)) {
    return "WAIT";
  }

  if (price > ema20 && ema20 > ema50) return "BULLISH";
  if (price < ema20 && ema20 < ema50) return "BEARISH";

  return "SIDEWAYS";
}

function renderIndex(prefix, d) {
  const price = getValue(d, ["price", "ltp", "lastPrice", "spot", "close"]);
  const change = getValue(d, ["change", "netChange"]);
  const pct = getValue(d, ["changePercent", "pChange", "percentChange"]);

  const ema20 = getValue(d, [
    "trend.ema20", "indicators.ema20", "ema20", "EMA20", "ema_20"
  ]);

  const ema50 = getValue(d, [
    "trend.ema50", "indicators.ema50", "ema50", "EMA50", "ema_50"
  ]);

  const support = getValue(d, [
    "supportResistance.support1",
    "levels.support", "support", "support1", "s1"
  ]);

  const resistance = getValue(d, [
    "supportResistance.resistance1",
    "levels.resistance", "resistance", "resistance1", "r1"
  ]);

  put(prefix + "Price", fmt(price));
  put(prefix + "Ema20", fmt(ema20));
  put(prefix + "Ema50", fmt(ema50));
  put(prefix + "Support", fmt(support));
  put(prefix + "Resistance", fmt(resistance));

  put(
    prefix + "Change",
    change === null ? "--" :
    `${Number(change) > 0 ? "+" : ""}${fmt(change)}${
      pct === null ? "" : ` (${fmt(pct)}%)`
    }`
  );

  const trend = getTrend(d);
  setTag(prefix + "Trend", trend);

  const changeEl = $(prefix + "Change");
  if (changeEl) {
    changeEl.className = "index-change " +
      (Number(change) > 0 ? "up" : Number(change) < 0 ? "down" : "");
  }

  return trend;
}

function signal(trend, data) {
  const status = String(getValue(data, [
    "verification", "dataStatus", "status",
    "meta.verification", "meta.status"
  ]) || "").toUpperCase();

  const verified = status.includes("LIVE") &&
    !status.includes("UNVERIFIED") &&
    !status.includes("EXPERIMENTAL");

  if (!verified || !["BULLISH", "BEARISH"].includes(trend)) {
    put("signalTitle", "WAIT — NO TRADE");
    put("signalMessage", "Live data verification and trend confirmation required.");

    ["entryCondition", "spotSL", "spotT1", "spotT2"]
      .forEach(id => put(id, "--"));

    setTag("setupTrend", trend);
    return;
  }

  put("signalTitle",
    trend === "BULLISH" ? "CE SETUP — CONFIRMATION REQUIRED" :
    "PE SETUP — CONFIRMATION REQUIRED"
  );

  put("signalMessage", "Confirm volume, OI and risk before any trade.");
  setTag("setupTrend", trend);
}

async function loadMarket() {
  const btn = $("refreshBtn");
  if (btn) btn.disabled = true;

  try {
    const response = await fetch(API_URL, { cache: "no-store" });

    if (!response.ok) throw new Error("API ERROR " + response.status);

    const data = await response.json();
    const root = data.data || data.market || data;

    const nifty = root.nifty || root.nifty50 || root.NIFTY || root.nifty_50;
    const bank = root.bankNifty || root.bank_nifty || root.BANKNIFTY || root.banknifty;

    if (nifty) {
      const trend = renderIndex("nifty", nifty);
      signal(trend, data);
    }

    if (bank) renderIndex("bank", bank);

    put("marketStatus",
      "MARKET STATUS: " +
      (getValue(data, ["marketStatus", "market_status", "meta.marketStatus"]) || "--")
    );

    put("dataSource",
      getValue(data, ["source", "provider", "dataSource", "meta.source"]) || "Backend API"
    );

    put("verification",
      getValue(data, ["verification", "dataStatus", "status", "meta.verification"]) || "UNVERIFIED"
    );

    put("lastChecked", new Date().toLocaleTimeString("en-IN"));

  } catch (error) {
    put("lastChecked", "Connection failed");
    put("signalTitle", "WAIT — NO TRADE");
    put("signalMessage", error.message);
    put("verification", "UNVERIFIED");
    console.error(error);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function calculate(prefix) {
  const lots = +$(prefix + "Lots").value;
  const size = +$(prefix + "LotSize").value;
  const premium = +$(prefix + "Premium").value;
  const sl = +$(prefix + "SL").value;
  const t1 = +$(prefix + "T1").value;
  const t2 = +$(prefix + "T2").value;

  const qty = lots * size;

  if (![lots, size, premium, sl, t1, t2].every(Number.isFinite) ||
      lots <= 0 || size <= 0) return;

  const cash = n => "₹" + n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  put(prefix + "Qty", qty);
  put(prefix + "Investment", cash(qty * premium));
  put(prefix + "Loss", cash(Math.max(0, (premium - sl) * qty)));
  put(prefix + "Profit1", cash((t1 - premium) * qty));
  put(prefix + "Profit2", cash((t2 - premium) * qty));
}

function initCalc(prefix) {
  ["Lots", "LotSize", "Premium", "SL", "T1", "T2"].forEach(key => {
    const el = $(prefix + key);
    if (el) el.addEventListener("input", () => calculate(prefix));
  });
  calculate(prefix);
}

$("refreshBtn").addEventListener("click", loadMarket);

initCalc("ce");
initCalc("pe");

$("ceBuyBtn").addEventListener("click", () => {
  $("ceCalculator").scrollIntoView({ behavior: "smooth", block: "center" });
});

$("peBuyBtn").addEventListener("click", () => {
  $("peCalculator").scrollIntoView({ behavior: "smooth", block: "center" });
});

loadMarket();
setInterval(loadMarket, REFRESH_MS);
