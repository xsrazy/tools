"use strict";
/* Shared helpers and calculator logic for the Finance Calculators site.
   Each page calls its own init function; functions no-op when their
   elements are absent. Pure math (pmt, amortize, compoundGrowth, ccSim)
   has no DOM dependencies. */
const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (id, fallback) => {
  const el = $(id);
  if (!el) return fallback || 0;
  const v = parseFloat(el.value);
  return Number.isFinite(v) ? v : (fallback || 0);
};
const money = (v, dec) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const futureDate = (monthsAhead) => {
  const d = new Date();
  d.setMonth(d.getMonth() + monthsAhead);
  return MONTHS[d.getMonth()] + " " + d.getFullYear();
};
const duration = (months) => {
  const y = Math.floor(months / 12), m = months % 12;
  if (y && m) return y + " yr " + m + " mo";
  if (y) return y + (y === 1 ? " year" : " years");
  return m + (m === 1 ? " month" : " months");
};

/* ---------- shared math ---------- */
function pmt(principal, annualRatePct, months) {
  const r = annualRatePct / 100 / 12;
  if (months <= 0) return 0;
  if (r === 0) return principal / months;
  const f = Math.pow(1 + r, months);
  return principal * r * f / (f - 1);
}
// Returns payment, totals, yearly rows and yearly balance samples.
function amortize(principal, annualRatePct, months) {
  const r = annualRatePct / 100 / 12;
  const payment = pmt(principal, annualRatePct, months);
  let bal = principal, totInt = 0;
  const yearly = [], balances = [principal];
  let yPrin = 0, yInt = 0;
  for (let m = 1; m <= months; m++) {
    const interest = bal * r;
    let prin = payment - interest;
    if (m === months || prin > bal) prin = bal;
    bal -= prin; totInt += interest; yPrin += prin; yInt += interest;
    if (m % 12 === 0 || m === months) {
      yearly.push({ year: yearly.length + 1, principal: yPrin, interest: yInt, balance: Math.max(0, bal) });
      balances.push(Math.max(0, bal));
      yPrin = 0; yInt = 0;
    }
  }
  return { payment, totalInterest: totInt, totalPaid: principal + totInt, yearly, balances };
}
// Pure compound-growth engine: contributions added at the end of each period.
function compoundGrowth(P, monthly, ratePct, years, m) {
  const rate = ratePct / 100;
  const perPeriod = rate / m;
  const contribPerPeriod = monthly * 12 / m;
  let bal = P, contributed = P;
  const rows = [{ year: 0, contrib: P, total: P }];
  for (let y = 1; y <= years; y++) {
    for (let k = 0; k < m; k++) { bal = bal * (1 + perPeriod) + contribPerPeriod; contributed += contribPerPeriod; }
    rows.push({ year: y, contrib: contributed, total: bal });
  }
  return { balance: bal, contributed, earned: bal - contributed, rows };
}

/* ---------- shared rendering ---------- */
function lineChart(el, seriesList, opts) {
  if (!el) return;
  opts = opts || {};
  const W = 640, H = 240, padL = 8, padR = 8, padT = 14, padB = 26;
  let maxV = 0, maxX = 0;
  seriesList.forEach(s => s.points.forEach(p => { if (p[1] > maxV) maxV = p[1]; if (p[0] > maxX) maxX = p[0]; }));
  if (maxV <= 0) { el.innerHTML = ""; return; }
  const X = (x) => padL + (x / (maxX || 1)) * (W - padL - padR);
  const Y = (v) => padT + (1 - v / maxV) * (H - padT - padB);
  let svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Balance chart">';
  svg += '<line x1="' + padL + '" y1="' + Y(0) + '" x2="' + (W - padR) + '" y2="' + Y(0) + '" stroke="var(--line)" stroke-width="1"/>';
  seriesList.forEach(s => {
    const pts = s.points.map(p => X(p[0]).toFixed(1) + "," + Y(p[1]).toFixed(1)).join(" ");
    if (s.fill) svg += '<polygon points="' + X(0) + "," + Y(0) + " " + pts + " " + X(maxX) + "," + Y(0) + '" fill="' + s.color + '" opacity="0.10"/>';
    svg += '<polyline points="' + pts + '" fill="none" stroke="' + s.color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"' + (s.dash ? ' stroke-dasharray="6 5"' : "") + "/>";
  });
  svg += '<text x="' + padL + '" y="' + (H - 6) + '" font-size="12" fill="var(--faint)">' + (opts.x0 || "Start") + "</text>";
  svg += '<text x="' + (W - padR) + '" y="' + (H - 6) + '" font-size="12" fill="var(--faint)" text-anchor="end">' + (opts.x1 || "") + "</text>";
  svg += '<text x="' + padL + '" y="' + (padT - 2) + '" font-size="12" fill="var(--faint)">' + money(maxV) + "</text>";
  svg += "</svg>";
  el.innerHTML = svg;
}
function donut(el, legendEl, parts) {
  if (!el) return;
  const total = parts.reduce((a, p) => a + p.value, 0);
  const R = 64, C = 2 * Math.PI * R;
  let offset = 0, circles = "";
  if (total > 0) {
    parts.forEach(p => {
      const frac = p.value / total;
      if (frac > 0) {
        circles += '<circle cx="90" cy="90" r="' + R + '" fill="none" stroke="' + p.color + '" stroke-width="26" stroke-dasharray="' + (frac * C).toFixed(1) + " " + C.toFixed(1) + '" stroke-dashoffset="' + (-offset * C).toFixed(1) + '" transform="rotate(-90 90 90)"/>';
      }
      offset += frac;
    });
  }
  el.innerHTML = '<svg viewBox="0 0 180 180" style="max-width:190px" role="img" aria-label="Breakdown chart">' + circles +
    '<text x="90" y="86" text-anchor="middle" font-size="13" fill="var(--faint)">Total</text>' +
    '<text x="90" y="106" text-anchor="middle" font-size="16" font-weight="600" fill="var(--ink)" font-family="IBM Plex Mono, monospace">' + money(total) + "</text></svg>";
  if (legendEl) legendEl.innerHTML = parts.map(p =>
    '<span><span class="swatch" style="background:' + p.color + '"></span>' + p.label + ": <strong>" + money(p.value) + "</strong></span>"
  ).join("");
}
function scheduleRows(tbody, yearly) {
  if (!tbody) return;
  tbody.innerHTML = yearly.map(r =>
    "<tr><td>Year " + r.year + "</td><td>" + money(r.principal) + "</td><td>" + money(r.interest) + "</td><td>" + money(r.balance) + "</td></tr>"
  ).join("");
}
function bindPair(numId, rangeId, onChange) {
  const n = $(numId), r = $(rangeId);
  if (n) n.addEventListener("input", () => { if (r) r.value = n.value; onChange(); });
  if (r) r.addEventListener("input", () => { if (n) n.value = r.value; onChange(); });
}
function bind(id, onChange) { const e = $(id); if (e) e.addEventListener("input", onChange); if (e) e.addEventListener("change", onChange); }

/* ================= MORTGAGE ================= */
function calcMortgage() {
  if (!$("m-price")) return;
  const price = Math.max(0, num("m-price"));
  const downPct = clamp(num("m-down"), 0, 100);
  const rate = Math.max(0, num("m-rate"));
  const years = parseInt($("m-term").value, 10);
  const tax = Math.max(0, num("m-tax")), ins = Math.max(0, num("m-ins")), hoa = Math.max(0, num("m-hoa"));
  const down = price * downPct / 100;
  const loan = Math.max(0, price - down);
  const months = years * 12;
  const a = amortize(loan, rate, months);
  const taxM = tax / 12, insM = ins / 12;
  // PMI: 0.55%/yr of loan while LTV > 80%
  let pmiM = 0, pmiMonths = 0;
  if (downPct < 20 && loan > 0) {
    pmiM = loan * 0.0055 / 12;
    let bal = loan; const r = rate / 100 / 12;
    for (let m = 1; m <= months; m++) {
      bal -= (a.payment - bal * r);
      if (bal <= price * 0.8) { pmiMonths = m; break; }
    }
    if (pmiMonths === 0) pmiMonths = months;
  }
  const total = a.payment + taxM + insM + hoa + pmiM;
  $("m-down-usd").textContent = money(down) + " down, " + money(loan) + " loan";
  $("m-total").textContent = money(total, 2);
  $("m-pi").textContent = money(a.payment, 2);
  $("m-loan").textContent = money(loan);
  $("m-interest").textContent = money(a.totalInterest);
  $("m-payoff").textContent = futureDate(months);
  $("m-note").textContent = "Principal & interest " + money(a.payment, 2) + ", Tax " + money(taxM, 2) + ", Insurance " + money(insM, 2) +
    (hoa ? ", HOA " + money(hoa, 2) : "") + (pmiM ? ", PMI " + money(pmiM, 2) : "") + " per month.";
  donut($("m-donut"), $("m-legend"), [
    { label: "Principal & interest", value: a.payment, color: "var(--accent)" },
    { label: "Property tax", value: taxM, color: "var(--amber)" },
    { label: "Insurance", value: insM, color: "#4a7fb5" },
    { label: "HOA", value: hoa, color: "#9a6bc0" },
    { label: "PMI", value: pmiM, color: "var(--danger)" }
  ].filter(p => p.value > 0));
  lineChart($("m-line"), [{ points: a.balances.map((b, i) => [i, b]), color: "var(--accent)", fill: true }], { x1: "Year " + years });
  scheduleRows($("m-schedule"), a.yearly);
  const co = $("m-callout");
  if (pmiM > 0) {
    co.innerHTML = '<div class="callout warn"><strong>PMI included:</strong> with ' + downPct + '% down, PMI adds about ' + money(pmiM, 2) + '/month until the balance reaches 80% of the home price, around ' + futureDate(pmiMonths) + '. Reaching 20% down would remove it entirely.</div>';
  } else if (loan > 0) {
    const interestShare = a.totalInterest / (loan + a.totalInterest) * 100;
    co.innerHTML = '<div class="callout good"><strong>Interest check:</strong> over ' + years + ' years you pay ' + money(a.totalInterest) + ' in interest, which is ' + interestShare.toFixed(0) + '% of everything you repay. One extra principal payment per year would cut years off the schedule.</div>';
  } else co.innerHTML = "";
}
function initMortgage() {
  if (!$("m-price")) return;
  ["m-price", "m-down", "m-rate"].forEach(p => bindPair(p, p + "-r", calcMortgage));
  ["m-term", "m-tax", "m-ins", "m-hoa"].forEach(id => bind(id, calcMortgage));
  calcMortgage();
}

/* ================= LOAN ================= */
function calcLoan() {
  if (!$("l-amount")) return;
  const amount = Math.max(0, num("l-amount"));
  const rate = Math.max(0, num("l-rate"));
  const months = Math.min(1200, Math.max(1, Math.round(num("l-term", 60))));
  $("l-term-hint").textContent = months >= 12 ? "about " + (months / 12).toFixed(months % 12 ? 1 : 0) + " years" : "";
  const a = amortize(amount, rate, months);
  $("l-payment").textContent = money(a.payment, 2);
  $("l-interest").textContent = money(a.totalInterest);
  $("l-total").textContent = money(a.totalPaid);
  $("l-payoff").textContent = futureDate(months);
  $("l-note").textContent = months + " monthly payments of " + money(a.payment, 2) + ", and the loan costs " + money(a.totalInterest) + " in interest on top of the " + money(amount) + " borrowed.";
  donut($("l-donut"), $("l-legend"), [
    { label: "Principal", value: amount, color: "var(--accent)" },
    { label: "Interest", value: a.totalInterest, color: "var(--amber)" }
  ]);
  lineChart($("l-line"), [{ points: a.balances.map((b, i) => [i, b]), color: "var(--accent)", fill: true }], { x1: months >= 12 ? "Year " + Math.ceil(months / 12) : "Month " + months });
  scheduleRows($("l-schedule"), a.yearly);
}
function initLoan() {
  if (!$("l-amount")) return;
  ["l-amount", "l-rate", "l-term"].forEach(p => bindPair(p, p + "-r", calcLoan));
  calcLoan();
}

/* ================= COMPOUND ================= */
function calcCompound() {
  if (!$("c-initial")) return;
  const P = Math.max(0, num("c-initial"));
  const monthly = Math.max(0, num("c-monthly"));
  const ratePct = Math.max(0, num("c-rate"));
  const years = clamp(Math.round(num("c-years", 25)), 1, 60);
  const m = parseInt($("c-freq").value, 10);
  const g = compoundGrowth(P, monthly, ratePct, years, m);
  const rows = g.rows, bal = g.balance, contributed = g.contributed, earned = g.earned;
  $("c-fv").textContent = money(bal);
  $("c-contrib").textContent = money(contributed);
  $("c-earned").textContent = money(earned);
  $("c-multiple").textContent = contributed > 0 ? (bal / contributed).toFixed(2) + "x" : "-";
  $("c-note").textContent = "After " + years + " years at " + num("c-rate") + "% compounded " + $("c-freq").selectedOptions[0].text.toLowerCase() + ", with " + money(monthly) + " added monthly.";
  // stacked bars
  const W = 640, H = 240, padB = 26, padT = 14;
  const maxV = Math.max(...rows.map(r => r.total), 1);
  const bw = (W - 16) / rows.length;
  let svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Growth chart">';
  rows.forEach((r, i) => {
    if (i === 0) return;
    const x = 8 + i * bw;
    const hT = (r.total / maxV) * (H - padB - padT);
    const hC = (r.contrib / maxV) * (H - padB - padT);
    svg += '<rect x="' + x.toFixed(1) + '" y="' + (H - padB - hT).toFixed(1) + '" width="' + Math.max(2, bw - 2).toFixed(1) + '" height="' + hT.toFixed(1) + '" fill="var(--amber)" rx="1"/>';
    svg += '<rect x="' + x.toFixed(1) + '" y="' + (H - padB - hC).toFixed(1) + '" width="' + Math.max(2, bw - 2).toFixed(1) + '" height="' + hC.toFixed(1) + '" fill="var(--accent)" rx="1"/>';
  });
  svg += '<line x1="8" y1="' + (H - padB) + '" x2="' + (W - 8) + '" y2="' + (H - padB) + '" stroke="var(--line)"/>';
  svg += '<text x="8" y="' + (H - 6) + '" font-size="12" fill="var(--faint)">Year 1</text>';
  svg += '<text x="' + (W - 8) + '" y="' + (H - 6) + '" font-size="12" fill="var(--faint)" text-anchor="end">Year ' + years + "</text>";
  svg += '<text x="8" y="' + (padT - 2) + '" font-size="12" fill="var(--faint)">' + money(maxV) + "</text>";
  svg += "</svg>";
  $("c-bars").innerHTML = svg;
  const half = rows[Math.floor(years / 2)];
  const lateGrowth = half ? ((bal - half.total) / Math.max(bal, 1) * 100).toFixed(0) : 0;
  $("c-callout").innerHTML = '<div class="callout good"><strong>The back half does the heavy lifting:</strong> about ' + lateGrowth + '% of the final value arrives after year ' + Math.floor(years / 2) + ', once interest starts earning its own interest. Time in the account matters more than the size of any single deposit.</div>';
}
function initCompound() {
  if (!$("c-initial")) return;
  ["c-initial", "c-monthly", "c-rate", "c-years"].forEach(p => bindPair(p, p + "-r", calcCompound));
  bind("c-freq", calcCompound);
  calcCompound();
}

/* ================= REFINANCE ================= */
function calcRefinance() {
  if (!$("r-balance")) return;
  const bal = Math.max(0, num("r-balance"));
  const curRate = Math.max(0, num("r-currate"));
  const curMonths = Math.max(1, Math.round(num("r-curterm", 26) * 12));
  const newRate = Math.max(0, num("r-newrate"));
  const newMonths = parseInt($("r-newterm").value, 10) * 12;
  const costs = Math.max(0, num("r-costs"));
  const curPay = pmt(bal, curRate, curMonths);
  const newPay = pmt(bal, newRate, newMonths);
  const curTotal = curPay * curMonths;
  const newTotal = newPay * newMonths + costs;
  const mSave = curPay - newPay;
  const lifeSave = curTotal - newTotal;
  $("r-newpay").textContent = money(newPay, 2);
  $("r-curpay").textContent = money(curPay, 2);
  const ms = $("r-msave");
  ms.textContent = (mSave >= 0 ? "" : "-") + money(Math.abs(mSave), 2);
  ms.className = "v " + (mSave >= 0 ? "good" : "bad");
  const ls = $("r-lifesave");
  ls.textContent = (lifeSave >= 0 ? "" : "-") + money(Math.abs(lifeSave));
  ls.className = "v " + (lifeSave >= 0 ? "good" : "bad");
  let beText = "-", beNote = "";
  if (mSave > 0) {
    const be = Math.ceil(costs / mSave);
    beText = be + (be === 1 ? " month" : " months");
    beNote = " You break even in " + beText + " (" + futureDate(be) + ").";
  }
  $("r-breakeven").textContent = beText;
  $("r-note").textContent = "Refinancing from " + num("r-currate") + "% to " + num("r-newrate") + "% on a " + money(bal) + " balance, with " + money(costs) + " in closing costs." + beNote;
  // horizontal comparison bars
  const W = 640, rowH = 34, gap = 14, H = rowH * 2 + gap + 8;
  const maxV = Math.max(curTotal, newTotal, 1);
  const bar = (y, v, color) => '<rect x="0" y="' + y + '" width="' + (v / maxV * W).toFixed(1) + '" height="' + rowH + '" rx="6" fill="' + color + '"/>' +
    '<text x="' + Math.min(W - 4, (v / maxV * W) + 8).toFixed(1) + '" y="' + (y + rowH / 2 + 5) + '" font-size="14" font-weight="600" fill="var(--ink)" font-family="IBM Plex Mono, monospace">' + money(v) + "</text>";
  $("r-bars").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Total cost comparison">' + bar(0, curTotal, "var(--faint)") + bar(rowH + gap, newTotal, "var(--accent)") + "</svg>";
  const co = $("r-callout");
  if (mSave > 0 && lifeSave > 0) {
    co.innerHTML = '<div class="callout good"><strong>Refinancing wins on both measures:</strong> ' + money(mSave, 2) + ' less per month and ' + money(lifeSave) + ' less over the life of the loan, after closing costs.</div>';
  } else if (mSave > 0 && lifeSave <= 0) {
    co.innerHTML = '<div class="callout warn"><strong>Lower payment, higher total cost:</strong> the monthly payment drops by ' + money(mSave, 2) + ', but stretching the balance over a new ' + $("r-newterm").value + '-year term means paying ' + money(Math.abs(lifeSave)) + ' more overall. A shorter new term may fix this.</div>';
  } else {
    co.innerHTML = '<div class="callout bad"><strong>This refinance does not pay:</strong> the new payment is not lower than your current one. Try a lower rate or a different term.</div>';
  }
}
function initRefinance() {
  if (!$("r-balance")) return;
  ["r-balance", "r-currate", "r-curterm", "r-newrate", "r-costs"].forEach(id => bind(id, calcRefinance));
  bind("r-newterm", calcRefinance);
  calcRefinance();
}

/* ================= CREDIT CARD ================= */
let ccMode = "fixed";
function ccSim(balance, aprPct, monthlyPayment, minMode, extra) {
  const r = aprPct / 100 / 12;
  let bal = balance, totInt = 0, months = 0;
  const yearlyPts = [[0, balance]];
  while (bal > 0 && months < 1200) {
    const interest = bal * r;
    let pay;
    if (minMode) pay = Math.max(25, Math.max(interest + bal * 0.01, bal * 0.02)) + (extra || 0);
    else pay = monthlyPayment;
    pay = Math.min(pay, bal + interest);
    if (pay <= interest && bal > 0) return { never: true, months, totalInterest: totInt };
    bal = bal + interest - pay; totInt += interest; months++;
    if (months % 12 === 0 || bal <= 0) yearlyPts.push([months / 12, Math.max(0, bal)]);
  }
  return { never: bal > 0, months, totalInterest: totInt, points: yearlyPts };
}
function calcCreditCard() {
  if (!$("cc-balance")) return;
  const balance = Math.max(0, num("cc-balance"));
  const apr = Math.max(0, num("cc-apr"));
  const fixed = Math.max(0, num("cc-payment"));
  const extra = Math.max(0, num("cc-extra"));
  const minMode = ccMode === "min";
  const base = ccSim(balance, apr, fixed, minMode, 0);
  const boosted = ccSim(balance, apr, fixed + extra, minMode, minMode ? extra : 0);
  const note = $("cc-note"), co = $("cc-callout");
  if (base.never) {
    $("cc-time").textContent = "Never";
    $("cc-interest").textContent = "-";
    $("cc-total").textContent = "-";
    $("cc-date").textContent = "-";
    note.textContent = minMode ? "This balance does not shrink on minimum payments at this APR." : "A payment of " + money(fixed, 2) + " does not cover the monthly interest of about " + money(balance * apr / 100 / 12, 2) + ", so the balance never falls.";
    co.innerHTML = '<div class="callout bad"><strong>Payment too low:</strong> at ' + apr + '% APR the first month\'s interest alone is about ' + money(balance * apr / 100 / 12, 2) + '. The payment has to beat that, and the more it beats it by, the faster the balance falls.</div>';
    $("cc-line").innerHTML = ""; $("cc-legend").innerHTML = "";
    return;
  }
  $("cc-time").textContent = duration(base.months);
  $("cc-interest").textContent = money(base.totalInterest);
  $("cc-total").textContent = money(balance + base.totalInterest);
  $("cc-date").textContent = futureDate(base.months);
  note.textContent = minMode
    ? "Paying only the minimum (interest + 1% of balance, $25 floor) on " + money(balance) + " at " + apr + "% APR."
    : "Paying a fixed " + money(fixed) + " per month on " + money(balance) + " at " + apr + "% APR.";
  const series = [{ points: base.points, color: "var(--danger)", fill: true }];
  let legend = '<span><span class="swatch" style="background:var(--danger)"></span>Current plan</span>';
  if (!boosted.never && extra > 0 && boosted.months < base.months) {
    series.push({ points: boosted.points, color: "var(--accent)", dash: true });
    legend += '<span><span class="swatch" style="background:var(--accent)"></span>With +' + money(extra) + "/month</span>";
    co.innerHTML = '<div class="callout good"><strong>Adding ' + money(extra) + '/month</strong> clears the card ' + duration(base.months - boosted.months) + ' sooner and saves ' + money(base.totalInterest - boosted.totalInterest) + ' in interest.</div>';
  } else if (minMode) {
    co.innerHTML = '<div class="callout warn"><strong>Minimum payments stretch this to ' + duration(base.months) + '</strong> and ' + money(base.totalInterest) + ' of interest, more than half the original balance. Switching to a fixed payment, even the same first-month amount, ends it years earlier.</div>';
  } else {
    co.innerHTML = '<div class="callout good"><strong>Fixed payments are the right call:</strong> keeping the amount constant instead of letting it shrink with the balance is what ends the debt in ' + duration(base.months) + ' instead of a decade.</div>';
  }
  lineChart($("cc-line"), series, { x1: "Year " + Math.ceil(base.months / 12) });
  $("cc-legend").innerHTML = legend;
}
function initCreditCard() {
  if (!$("cc-balance")) return;
  const bf = $("cc-mode-fixed"), bm = $("cc-mode-min");
  if (bf) bf.addEventListener("click", () => { ccMode = "fixed"; bf.setAttribute("aria-pressed", "true"); bm.setAttribute("aria-pressed", "false"); $("cc-fixed-wrap").style.display = ""; calcCreditCard(); });
  if (bm) bm.addEventListener("click", () => { ccMode = "min"; bm.setAttribute("aria-pressed", "true"); bf.setAttribute("aria-pressed", "false"); $("cc-fixed-wrap").style.display = "none"; calcCreditCard(); });
  ["cc-balance", "cc-apr", "cc-payment", "cc-extra"].forEach(p => bindPair(p, p + "-r", calcCreditCard));
  calcCreditCard();
}

/* ================= PAYCHECK ================= */
function calcPaycheck() {
  if (!$("p-gross")) return;
  const gross = Math.max(0, num("p-gross"));
  const periods = parseInt($("p-freq").value, 10) || 26;
  const retire = Math.max(0, num("p-retire"));
  const health = Math.max(0, num("p-health"));
  const taxRate = clamp(num("p-tax", 22), 0, 100);
  const grossA = gross * periods;
  const deductA = (retire + health) * periods;
  const taxable = Math.max(0, grossA - deductA);
  const taxes = taxable * taxRate / 100;
  const netA = grossA - deductA - taxes;
  const net = netA / periods;
  const freqName = $("p-freq").selectedOptions[0].text.split(" (")[0].toLowerCase();
  $("p-net").textContent = money(net, 2);
  $("p-grossa").textContent = money(grossA);
  $("p-deduct").textContent = money(deductA);
  $("p-taxes").textContent = money(taxes);
  $("p-neta").textContent = money(netA);
  $("p-note").textContent = "Paid " + freqName + " (" + periods + " paychecks/year) at a " + taxRate + "% estimated tax rate.";
  donut($("p-donut"), $("p-legend"), [
    { label: "Take-home pay", value: netA, color: "var(--accent)" },
    { label: "Pre-tax deductions", value: deductA, color: "var(--amber)" },
    { label: "Est. taxes", value: taxes, color: "var(--danger)" }
  ].filter(p => p.value > 0));
  $("p-callout").innerHTML = '<div class="callout info"><strong>Estimate only:</strong> this uses one flat tax rate. Real US paychecks apply progressive federal brackets plus state/local tax, Social Security and Medicare. Not tax advice.</div>';
}
function initPaycheck() {
  if (!$("p-gross")) return;
  ["p-gross", "p-retire", "p-health", "p-tax"].forEach(p => bindPair(p, p + "-r", calcPaycheck));
  bind("p-freq", calcPaycheck);
  calcPaycheck();
}

/* ================= HOURLY TO SALARY ================= */
let hLock = false;
function calcHourly(fromAnnual) {
  if (!$("h-wage")) return;
  let wage, hours, annual;
  hours = Math.max(0, num("h-hours", 40));
  if (fromAnnual) {
    annual = Math.max(0, num("h-annual"));
    wage = hours > 0 ? annual / 52 / hours : 0;
    hLock = true;
    $("h-wage").value = wage.toFixed(2);
    const r = $("h-wage-r"); if (r) r.value = Math.min(150, Math.max(5, wage));
    hLock = false;
  } else {
    wage = Math.max(0, num("h-wage"));
    annual = wage * hours * 52;
    hLock = true;
    $("h-annual").value = Math.round(annual);
    const r = $("h-annual-r"); if (r) r.value = Math.min(400000, Math.max(10000, Math.round(annual)));
    hLock = false;
  }
  const weekly = wage * hours;
  $("h-out-annual").textContent = money(annual);
  $("h-out-hourly").textContent = money(wage, 2);
  $("h-out-weekly").textContent = money(weekly);
  $("h-out-biweekly").textContent = money(weekly * 2);
  $("h-out-monthly").textContent = money(annual / 12, 2);
  $("h-out-daily").textContent = money(wage * 8, 2);
  $("h-out-hours").textContent = Math.round(hours * 52).toLocaleString("en-US");
  $("h-note").textContent = money(wage, 2) + "/hour at " + hours + " hours/week, 52 weeks a year. Gross pay before taxes and deductions.";
  $("h-callout").innerHTML = '<div class="callout info"><strong>Straight time assumed:</strong> no overtime premium and no unpaid weeks. A $1 raise at 40 hours/week is worth $2,080 a year.</div>';
}
function initHourly() {
  if (!$("h-wage")) return;
  const w = $("h-wage"), a = $("h-annual");
  if (w) w.addEventListener("input", () => { if (!hLock) { const r = $("h-wage-r"); if (r) r.value = w.value; calcHourly(false); } });
  const wr = $("h-wage-r");
  if (wr) wr.addEventListener("input", () => { w.value = wr.value; calcHourly(false); });
  if (a) a.addEventListener("input", () => { if (!hLock) { const r = $("h-annual-r"); if (r) r.value = a.value; calcHourly(true); } });
  const ar = $("h-annual-r");
  if (ar) ar.addEventListener("input", () => { a.value = ar.value; calcHourly(true); });
  bind("h-hours", () => calcHourly(false));
  const hr = $("h-hours-r");
  if (hr) hr.addEventListener("input", () => { $("h-hours").value = hr.value; calcHourly(false); });
  calcHourly(false);
}

/* ================= OVERTIME ================= */
function calcOvertime() {
  if (!$("o-rate")) return;
  const rate = Math.max(0, num("o-rate"));
  const reg = Math.max(0, num("o-reg"));
  const ot = Math.max(0, num("o-ot"));
  const dt = Math.max(0, num("o-dt"));
  const regPay = reg * rate;
  const otPay = ot * rate * 1.5;
  const dtPay = dt * rate * 2;
  const total = regPay + otPay + dtPay;
  const hours = reg + ot + dt;
  $("o-total").textContent = money(total, 2);
  $("o-regpay").textContent = money(regPay, 2);
  $("o-otpay").textContent = money(otPay, 2);
  $("o-dtpay").textContent = money(dtPay, 2);
  $("o-hours").textContent = hours.toLocaleString("en-US") + " hrs";
  $("o-note").textContent = hours.toLocaleString("en-US") + " total hours at " + money(rate, 2) + "/hour. Gross pay before taxes and deductions.";
  donut($("o-donut"), $("o-legend"), [
    { label: "Regular pay", value: regPay, color: "var(--accent)" },
    { label: "Overtime (1.5x)", value: otPay, color: "var(--amber)" },
    { label: "Double time (2x)", value: dtPay, color: "var(--danger)" }
  ].filter(p => p.value > 0));
  const co = $("o-callout");
  if (ot > 0 || dt > 0) {
    const premium = (otPay - ot * rate) + (dtPay - dt * rate);
    co.innerHTML = '<div class="callout good"><strong>Overtime premium: ' + money(premium, 2) + '.</strong> That is the extra pay above straight time for working these hours. Under federal law, hours over 40/week for non-exempt workers must be paid at 1.5x.</div>';
  } else {
    co.innerHTML = '<div class="callout info"><strong>No premium hours entered.</strong> Add overtime hours to see the 1.5x premium, or double-time hours for 2x.</div>';
  }
}
function initOvertime() {
  if (!$("o-rate")) return;
  ["o-rate", "o-reg", "o-ot", "o-dt"].forEach(p => bindPair(p, p + "-r", calcOvertime));
  calcOvertime();
}

/* ================= WORD COUNTER ================= */
function initWordCounter() {
  const input = $("wc-input");
  if (!input) return;
  const set = (id, v) => { const e = $(id); if (e) e.textContent = v.toLocaleString("en-US"); };
  const update = () => {
    const text = input.value;
    const words = (text.trim().match(/\S+/g) || []).length;
    const chars = text.length;
    const charsNoSpaces = text.replace(/\s/g, "").length;
    const sentences = (text.match(/[^.!?\n]+[.!?]+["']?/g) || []).length;
    const paragraphs = text.trim() ? text.split("\n").filter(l => l.trim() !== "").length : 0;
    const minutes = Math.ceil(words / 200);
    set("wc-words", words); set("wc-chars", chars); set("wc-charsns", charsNoSpaces);
    set("wc-sentences", sentences); set("wc-paragraphs", paragraphs);
    const rt = $("wc-reading");
    if (rt) rt.textContent = words === 0 ? "-" : (minutes < 1 ? "< 1 min" : "~" + minutes + " min");
    const note = $("wc-note");
    if (note) note.textContent = words === 0 ? "Start typing or paste text to see live counts." : words.toLocaleString("en-US") + " words analyzed locally in your browser.";
  };
  input.addEventListener("input", update);
  update();
}

/* ================= PASSWORD GENERATOR ================= */
function initPasswordGen() {
  if (!$("pg-length")) return;
  const SETS = {
    upper: "ABCDEFGHJKLMNPQRSTUVWXYZ",
    lower: "abcdefghijkmnopqrstuvwxyz",
    num: "23456789",
    sym: "!@#$%^&*()-_=+[]{};:,.<>?"
  };
  const out = $("pg-output"), bar = $("pg-bar"), sword = $("pg-strength");
  function gen() {
    const len = Math.max(4, Math.min(128, parseInt($("pg-length").value, 10) || 16));
    $("pg-length").value = len;
    const lr = $("pg-length-r"); if (lr) lr.value = len;
    const lv = $("pg-length-v"); if (lv) lv.textContent = len + " characters";
    let pool = "";
    if ($("pg-upper").checked) pool += SETS.upper;
    if ($("pg-lower").checked) pool += SETS.lower;
    if ($("pg-num").checked) pool += SETS.num;
    if ($("pg-sym").checked) pool += SETS.sym;
    if (!pool) {
      out.textContent = "Select at least one character set.";
      bar.style.width = "0%"; sword.textContent = "-";
      return;
    }
    const rnd = new Uint32Array(len);
    (window.crypto || window.msCrypto).getRandomValues(rnd);
    let pw = "";
    for (let i = 0; i < len; i++) pw += pool[rnd[i] % pool.length];
    out.textContent = pw;
    const bits = len * Math.log2(pool.length);
    let label, color;
    if (bits < 40) { label = "Weak"; color = "var(--danger)"; }
    else if (bits < 60) { label = "Fair"; color = "var(--amber)"; }
    else if (bits < 90) { label = "Strong"; color = "var(--accent)"; }
    else { label = "Very strong"; color = "var(--good)"; }
    bar.style.width = Math.min(100, bits / 1.28).toFixed(0) + "%";
    bar.style.background = color;
    sword.textContent = label + " (" + Math.round(bits) + " bits)";
  }
  ["pg-length", "pg-upper", "pg-lower", "pg-num", "pg-sym"].forEach(id => bind(id, gen));
  const lr = $("pg-length-r");
  if (lr) lr.addEventListener("input", () => { $("pg-length").value = lr.value; gen(); });
  const regen = $("pg-regen");
  if (regen) regen.addEventListener("click", gen);
  const copy = $("pg-copy");
  if (copy) copy.addEventListener("click", () => copyText(out.textContent, copy));
  gen();
}
function copyText(text, btn) {
  const done = () => {
    if (!btn) return;
    const old = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => { btn.textContent = old; }, 1400);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(done);
  } else {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta); done();
  }
}

/* ================= UNIT CONVERTER ================= */
const UC_UNITS = {
  length: [
    ["km", "Kilometers", 1000], ["m", "Meters", 1], ["cm", "Centimeters", 0.01], ["mm", "Millimeters", 0.001],
    ["mi", "Miles", 1609.344], ["yd", "Yards", 0.9144], ["ft", "Feet", 0.3048], ["in", "Inches", 0.0254]
  ],
  weight: [
    ["t", "Metric tons", 1000], ["kg", "Kilograms", 1], ["g", "Grams", 0.001], ["mg", "Milligrams", 0.000001],
    ["lb", "Pounds", 0.45359237], ["oz", "Ounces", 0.028349523125]
  ],
  temperature: [["c", "Celsius"], ["f", "Fahrenheit"], ["k", "Kelvin"]]
};
function ucToCelsius(v, u) { return u === "f" ? (v - 32) * 5 / 9 : u === "k" ? v - 273.15 : v; }
function ucFromCelsius(v, u) { return u === "f" ? v * 9 / 5 + 32 : u === "k" ? v + 273.15 : v; }
function initUnitConverter() {
  if (!$("uc-amount")) return;
  const catBtns = document.querySelectorAll("#uc-cats button");
  const fromSel = $("uc-from"), toSel = $("uc-to");
  let cat = "length";
  function fillSels() {
    [fromSel, toSel].forEach(sel => {
      sel.innerHTML = UC_UNITS[cat].map(u => '<option value="' + u[0] + '">' + u[1] + "</option>").join("");
    });
    if (cat === "length") { fromSel.value = "km"; toSel.value = "mi"; }
    if (cat === "weight") { fromSel.value = "kg"; toSel.value = "lb"; }
    if (cat === "temperature") { fromSel.value = "c"; toSel.value = "f"; }
  }
  function fmt(v) {
    if (!isFinite(v)) return "-";
    const a = Math.abs(v);
    if (a !== 0 && (a >= 1e12 || a < 1e-6)) return v.toExponential(4);
    return parseFloat(v.toPrecision(8)).toLocaleString("en-US", { maximumFractionDigits: 8 });
  }
  function convert() {
    const v = parseFloat($("uc-amount").value);
    const f = fromSel.value, t = toSel.value;
    const fl = fromSel.selectedOptions[0].text, tl = toSel.selectedOptions[0].text;
    let r;
    if (!isFinite(v)) r = NaN;
    else if (cat === "temperature") r = ucFromCelsius(ucToCelsius(v, f), t);
    else {
      const ff = UC_UNITS[cat].find(u => u[0] === f)[2];
      const tf = UC_UNITS[cat].find(u => u[0] === t)[2];
      r = v * ff / tf;
    }
    $("uc-result").textContent = fmt(r);
    $("uc-note").textContent = isFinite(v)
      ? v.toLocaleString("en-US") + " " + fl + " = " + fmt(r) + " " + tl
      : "Enter a value to convert.";
  }
  catBtns.forEach(b => b.addEventListener("click", () => {
    catBtns.forEach(x => x.setAttribute("aria-pressed", "false"));
    b.setAttribute("aria-pressed", "true");
    cat = b.dataset.cat; fillSels(); convert();
  }));
  bind("uc-amount", convert);
  fromSel.addEventListener("change", convert);
  toSel.addEventListener("change", convert);
  const swap = $("uc-swap");
  if (swap) swap.addEventListener("click", () => {
    const tmp = fromSel.value; fromSel.value = toSel.value; toSel.value = tmp; convert();
  });
  fillSels(); convert();
}

/* ================= TIME ZONE CONVERTER ================= */
const TZ_ZONES = [
  ["UTC", "UTC (Coordinated Universal Time)"],
  ["America/New_York", "New York (Eastern)"],
  ["America/Chicago", "Chicago (Central)"],
  ["America/Denver", "Denver (Mountain)"],
  ["America/Los_Angeles", "Los Angeles (Pacific)"],
  ["America/Anchorage", "Anchorage (Alaska)"],
  ["Pacific/Honolulu", "Honolulu (Hawaii)"],
  ["Europe/London", "London"],
  ["Europe/Paris", "Paris (Central Europe)"],
  ["Asia/Dubai", "Dubai"],
  ["Asia/Kolkata", "Mumbai / Kolkata (IST)"],
  ["Asia/Singapore", "Singapore"],
  ["Asia/Tokyo", "Tokyo"],
  ["Australia/Sydney", "Sydney"],
  ["Pacific/Auckland", "Auckland"]
];
function tzWallToUtc(dateStr, timeZone) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(dateStr);
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
  const parts = {};
  fmt.formatToParts(new Date(guess)).forEach(p => { parts[p.type] = p.value; });
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return new Date(guess - (asUTC - guess));
}
function initTimezone() {
  if (!$("tz-dt")) return;
  const fromSel = $("tz-from"), toSel = $("tz-to");
  [fromSel, toSel].forEach(sel => {
    sel.innerHTML = TZ_ZONES.map(z => '<option value="' + z[0] + '">' + z[1] + "</option>").join("");
  });
  fromSel.value = "America/New_York"; toSel.value = "Asia/Tokyo";
  const now = new Date();
  const pad = n => String(n).padStart(2, "0");
  $("tz-dt").value = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate()) + "T" + pad(now.getHours()) + ":" + pad(now.getMinutes());
  function convert() {
    const utc = tzWallToUtc($("tz-dt").value, fromSel.value);
    const out = $("tz-result"), note = $("tz-note");
    if (!utc) { out.textContent = "-"; note.textContent = "Pick a date and time to convert."; return; }
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: toSel.value, hourCycle: "h23", weekday: "short", year: "numeric",
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short"
    });
    out.textContent = fmt.format(utc);
    const fromName = fromSel.selectedOptions[0].text, toName = toSel.selectedOptions[0].text;
    note.textContent = "From " + fromName + " to " + toName + ". Daylight saving is handled automatically.";
  }
  bind("tz-dt", convert);
  fromSel.addEventListener("change", convert);
  toSel.addEventListener("change", convert);
  const nowBtn = $("tz-now");
  if (nowBtn) nowBtn.addEventListener("click", () => {
    const n = new Date(); const pad2 = x => String(x).padStart(2, "0");
    $("tz-dt").value = n.getFullYear() + "-" + pad2(n.getMonth() + 1) + "-" + pad2(n.getDate()) + "T" + pad2(n.getHours()) + ":" + pad2(n.getMinutes());
    convert();
  });
  convert();
}

/* ================= CASE CONVERTER ================= */
function initCaseConverter() {
  const input = $("cc-input");
  if (!input) return;
  const toTitle = s => s.toLowerCase().replace(/(^|[\s("'\-])(\S)/g, (m, p1, p2) => p1 + p2.toUpperCase());
  const toSentence = s => s.toLowerCase().replace(/(^\s*[a-z])|([.!?]\s*[a-z])/g, m => m.toUpperCase());
  const toAlt = s => {
    let out = "", up = true;
    for (const ch of s) {
      if (/[a-zA-Z]/.test(ch)) { out += up ? ch.toUpperCase() : ch.toLowerCase(); up = !up; }
      else out += ch;
    }
    return out;
  };
  const words = s => s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const cap = w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  const toCamel = s => { const w = words(s); return w.length ? w[0].toLowerCase() + w.slice(1).map(cap).join("") : ""; };
  const toPascal = s => words(s).map(cap).join("");
  const toSnake = s => words(s).map(w => w.toLowerCase()).join("_");
  const toKebab = s => words(s).map(w => w.toLowerCase()).join("-");
  const toConstant = s => words(s).map(w => w.toUpperCase()).join("_");
  const toDot = s => words(s).map(w => w.toLowerCase()).join(".");
  const toPath = s => words(s).map(w => w.toLowerCase()).join("/");
  const toHeader = s => words(s).map(cap).join("-");
  const toInverse = s => { let out = ""; for (const ch of s) { out += ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase(); } return out; };
  const toToggle = s => {
    let out = "", up = false;
    for (const ch of s) {
      if (/[a-zA-Z]/.test(ch)) { out += up ? ch.toUpperCase() : ch.toLowerCase(); up = !up; }
      else out += ch;
    }
    return out;
  };
  const cases = [
    ["cc-upper", s => s.toUpperCase()],
    ["cc-lower", s => s.toLowerCase()],
    ["cc-title", toTitle],
    ["cc-sentence", toSentence],
    ["cc-alt", toAlt],
    ["cc-camel", toCamel],
    ["cc-pascal", toPascal],
    ["cc-snake", toSnake],
    ["cc-kebab", toKebab],
    ["cc-constant", toConstant],
    ["cc-dot", toDot],
    ["cc-path", toPath],
    ["cc-header", toHeader],
    ["cc-inverse", toInverse],
    ["cc-toggle", toToggle]
  ];
  function update() {
    const v = input.value;
    cases.forEach(([id, fn]) => {
      const e = $(id);
      if (e) e.textContent = v ? fn(v) : "Converted text appears here.";
    });
    document.querySelectorAll(".mini-copy").forEach(b => {
      b.onclick = () => copyText($(b.dataset.target).textContent, b);
    });
  }
  input.addEventListener("input", update);
  update();
}

/* ================= LOREM IPSUM ================= */
const LOREM_WORDS = ("lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum perspiciatis unde omnis iste natus error voluptatem accusantium doloremque laudantium totam rem aperiam eaque ab illo inventore veritatis quasi architecto beatae vitae dicta explicabo nemo enim ipsam voluptatem quia voluptas aspernatur odit aut fugit consequuntur magni dolores eos ratione sequi nesciunt neque porro quisquam dolorem numquam eius modi tempora incidunt magnam quaerat").split(" ");
function initLorem() {
  if (!$("li-count")) return;
  const typeBtns = document.querySelectorAll("#li-types button");
  const out = $("li-output");
  let type = "paragraphs";
  function randWord() { return LOREM_WORDS[Math.floor(Math.random() * LOREM_WORDS.length)]; }
  function sentence() {
    const n = 6 + Math.floor(Math.random() * 10);
    const words = [];
    for (let i = 0; i < n; i++) words.push(randWord());
    let s = words.join(" ");
    return s.charAt(0).toUpperCase() + s.slice(1) + ".";
  }
  function paragraph() {
    const n = 4 + Math.floor(Math.random() * 4);
    const ss = [];
    for (let i = 0; i < n; i++) ss.push(sentence());
    return ss.join(" ");
  }
  function gen() {
    const count = Math.max(1, Math.min(100, parseInt($("li-count").value, 10) || 3));
    $("li-count").value = count;
    const lv = $("li-count-v"); if (lv) lv.textContent = count;
    let text = "";
    if (type === "paragraphs") {
      const ps = [];
      for (let i = 0; i < count; i++) ps.push(i === 0 ? "Lorem ipsum dolor sit amet, " + paragraph().charAt(0).toLowerCase() + paragraph().slice(1) : paragraph());
      text = ps.join("\n\n");
    } else if (type === "sentences") {
      const ss = [];
      for (let i = 0; i < count; i++) ss.push(i === 0 ? "Lorem ipsum dolor sit amet, " + sentence().charAt(0).toLowerCase() + sentence().slice(1) : sentence());
      text = ss.join(" ");
    } else {
      const ws = [];
      for (let i = 0; i < count; i++) ws.push(i === 0 ? "Lorem" : randWord());
      text = ws.join(" ");
      text = text.charAt(0).toUpperCase() + text.slice(1) + ".";
    }
    out.textContent = text;
    const w = (text.match(/\S+/g) || []).length;
    $("li-note").textContent = "Generated " + w.toLocaleString("en-US") + " words of placeholder text.";
  }
  typeBtns.forEach(b => b.addEventListener("click", () => {
    typeBtns.forEach(x => x.setAttribute("aria-pressed", "false"));
    b.setAttribute("aria-pressed", "true");
    type = b.dataset.type; gen();
  }));
  bind("li-count", gen);
  const g = $("li-generate");
  if (g) g.addEventListener("click", gen);
  const c = $("li-copy");
  if (c) c.addEventListener("click", () => copyText(out.textContent, c));
  gen();
}
