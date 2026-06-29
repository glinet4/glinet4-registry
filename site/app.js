"use strict";

const $ = (id) => document.getElementById(id);
const state = { manifest: null, devices: {}, current: null };

const PRESENT = new Set(["available", "needs_params"]);
const ABSENTISH = new Set(["absent", "unreachable", "other", "auth_error", "token_error"]);
const WRITE_VERBS = new Set(["set", "add", "update", "create", "del", "delete", "remove", "clear"]);

// Curated, friendly labels for the headline software capabilities (others stay in the raw block).
const SW_LABELS = {
  adguard: "AdGuard Home",
  tor: "Tor",
  vpn: "VPN",
  obfuscation: "VPN obfuscation",
  nas: "NAS / SMB file sharing",
  sms_forward: "SMS forwarding",
  bark: "Bark parental controls",
  ipv6: "IPv6",
  mlo: "MLO (Wi-Fi 7)",
  vlan: "VLAN",
  ids_ips: "IDS / IPS",
  secondwan: "Dual WAN / failover",
  repeater_eap: "Repeater (WPA-Ent)",
  passthrough: "Modem passthrough",
};

const cap = (p) => p.capabilities || {};
const hw = (p) => cap(p).hardware_feature || {};
const sw = (p) => cap(p).software_feature || {};
const truthy = (v) => v === true || (typeof v === "string" && v !== "" && v !== "0" && v !== "false");

const HW = [
  { label: "Cellular modem", fn: (p) => truthy(hw(p).simo) || truthy(hw(p).build_in_modem) },
  { label: "Bluetooth", fn: (p) => truthy(hw(p).bluetooth) },
  { label: "GPS", fn: (p) => truthy(hw(p).gps) },
  { label: "USB 3.0", fn: (p) => truthy(hw(p).usb3) },
  { label: "Screen", fn: (p) => truthy(hw(p).screen) },
  { label: "microSD", fn: (p) => truthy(hw(p).microsd) },
  { label: "NAND flash", fn: (p) => truthy(hw(p).nand) },
];

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}
const manifestOf = (id) => (state.manifest.devices || []).find((d) => d.id === id) || {};

// ---------- data ----------
async function loadAll() {
  state.manifest = await (await fetch("data/index.json")).json();
  await Promise.all((state.manifest.devices || []).map(async (d) => {
    try { state.devices[d.id] = await (await fetch(`data/devices/${d.id}.json`)).json(); }
    catch (_e) { /* skip a device that fails to load */ }
  }));
}

// ---------- get/set pairing (mirror of the OpenRPC export) ----------
function pairedRead(p, service, method) {
  const us = method.indexOf("_");
  if (us < 0) return null;
  const verb = method.slice(0, us), noun = method.slice(us + 1);
  if (!WRITE_VERBS.has(verb) || !noun) return null;
  const methods = (p.services[service]) || {};
  for (const cand of [`get_${noun}`, `get_${noun}_list`, `get_${noun}_config`, `get_${noun}_info`]) {
    const r = methods[cand];
    if (r && r.signature && typeof r.signature === "object" && !Array.isArray(r.signature)) {
      return { from: `${service}.${cand}`, shape: r.signature };
    }
  }
  return null;
}

// ---------- hero ----------
function renderHero() {
  const devs = Object.values(state.devices);
  let methods = 0, sigs = 0, inferred = 0;
  for (const p of devs) {
    for (const [svc, mm] of Object.entries(p.services || {})) {
      for (const [m, rec] of Object.entries(mm)) {
        if (!ABSENTISH.has(rec.status)) methods += 1;
        if (rec.signature != null) sigs += 1;
        if (rec.risk === "write" && !(rec.params && rec.params.length) && pairedRead(p, svc, m)) inferred += 1;
      }
    }
  }
  const stats = [
    { num: devs.length, label: devs.length === 1 ? "model profiled" : "models profiled" },
    { num: methods, label: "API methods mapped" },
    { num: sigs, label: "response signatures" },
    { num: inferred, label: "inferred write shapes", accent: true },
  ];
  $("hero-stats").innerHTML = stats.map((s) =>
    `<div class="stat"><div class="stat-num${s.accent ? " accent" : ""}">${s.num}</div>` +
    `<div class="stat-label">${s.label}</div></div>`).join("");
}

// ---------- feature matrix ----------
function yesno(v) { return truthy(v) ? '<span class="yes">✓</span>' : '<span class="no">✗</span>'; }

function matrixRows(devs) {
  const rows = [];
  rows.push({ group: "Region", label: "Regulatory region",
    cell: (p) => `<span class="cell-region">${escapeHtml(cap(p).country_code || "—")}</span>` });
  for (const [key, label] of Object.entries(SW_LABELS)) {
    if (devs.some((p) => typeof sw(p)[key] === "boolean")) {
      rows.push({ group: "Software", label, cell: (p) => yesno(sw(p)[key]) });
    }
  }
  if (devs.some((p) => cap(p).hardware_feature)) {
    for (const h of HW) rows.push({ group: "Hardware", label: h.label, cell: (p) => yesno(h.fn(p)) });
  }
  const stat = (k) => (p) => {
    const v = manifestOf(p.id)[k];
    return `<span class="cell-val">${v == null ? "—" : v}</span>`;
  };
  rows.push({ group: "API surface", label: "Available methods", cell: stat("available_count") });
  rows.push({ group: "API surface", label: "Discovered writes", cell: stat("discovered_count") });
  rows.push({ group: "API surface", label: "Services", cell: stat("service_count") });
  return rows;
}

function renderMatrix() {
  const devs = (state.manifest.devices || []).map((d) => state.devices[d.id]).filter(Boolean);
  const host = $("matrix-host");
  if (!devs.length) {
    host.innerHTML = '<p class="empty">No device profiles yet. Capture one with <code>glinet-profiler</code>.</p>';
    return;
  }
  const rows = matrixRows(devs);
  let html = '<table class="matrix"><thead><tr><th class="feat">Feature</th>';
  for (const p of devs) {
    html += `<th class="model-col" data-id="${escapeHtml(p.id)}">` +
      `<div class="m-name">${escapeHtml(p.model)}</div>` +
      `<div class="m-fw">${escapeHtml(p.firmware_version)}</div></th>`;
  }
  html += "</tr></thead><tbody>";
  let group = null;
  for (const r of rows) {
    if (r.group !== group) {
      group = r.group;
      html += `<tr class="grouprow"><td colspan="${devs.length + 1}">${escapeHtml(group)}</td></tr>`;
    }
    html += `<tr><td class="feat">${escapeHtml(r.label)}</td>`;
    for (const p of devs) html += `<td>${r.cell(p)}</td>`;
    html += "</tr>";
  }
  html += "</tbody></table>";
  host.innerHTML = html;
}

// ---------- detail ----------
function renderCaps(p) {
  const el = $("d-capabilities");
  const c = cap(p);
  if (!c.country_code && !c.software_feature && !c.hardware_feature) { el.hidden = true; return; }
  const onSw = Object.entries(SW_LABELS).filter(([k]) => sw(p)[k] === true).map(([, l]) => l);
  const onHw = HW.filter((h) => h.fn(p)).map((h) => h.label);
  const region = c.country_code
    ? `<div class="caps-region">Regulatory region <b>${escapeHtml(c.country_code)}</b></div>` : "";
  const chips = [...onSw, ...onHw].map((f) => `<span class="flag on">${escapeHtml(f)}</span>`).join("")
    || '<span class="flag">no capability flags</span>';
  const raw = JSON.stringify({ software_feature: sw(p), hardware_feature: hw(p) }, null, 2);
  el.innerHTML = region + `<div class="caps-flags">${chips}</div>` +
    `<details><summary>raw capability flags</summary><pre>${escapeHtml(raw)}</pre></details>`;
  el.hidden = false;
}

function badge(text, cls) { return `<span class="badge ${escapeHtml(cls)}">${escapeHtml(text)}</span>`; }
function block(label, body, req) {
  return `<div class="detail-block"><div class="detail-label${req ? " req" : ""}">${escapeHtml(label)}</div>` +
    `<pre>${escapeHtml(body)}</pre></div>`;
}

function methodRow(service, method, rec) {
  const present = PRESENT.has(rec.status);
  let cov = "";
  if (rec.covered_by) cov = badge(`gli4py: ${rec.covered_by}`, "cov-yes");
  else if (present) cov = badge("not in gli4py", "cov-no");
  const parts = [];
  if (rec.signature != null) parts.push(block("Response signature", JSON.stringify(rec.signature, null, 2)));
  const inferred = rec.risk === "write" && !(rec.params && rec.params.length)
    ? pairedRead(state.current, service, method) : null;
  if (inferred) parts.push(block(`Request shape · inferred from ${inferred.from}`, JSON.stringify(inferred.shape, null, 2), true));
  else if (rec.params && rec.params.length) parts.push(block("Params", JSON.stringify(rec.params, null, 2), true));
  const detail = parts.length ? `<div class="detail">${parts.join("")}</div>` : "";
  return `<div class="method">
    <div class="mhead">
      <span class="mname">${escapeHtml(method)}</span>
      ${badge(rec.status, "st-" + rec.status)}
      ${badge(rec.risk, "rk-" + rec.risk)}
      <span class="spacer"></span>${cov}
    </div>${detail}</div>`;
}

function renderResults() {
  const p = state.current;
  if (!p) return;
  const q = $("search").value.trim().toLowerCase();
  const availOnly = $("f-available").checked, writesOnly = $("f-writes").checked, unwrapped = $("f-unwrapped").checked;
  let shown = 0;
  const parts = [];
  for (const service of Object.keys(p.services).sort()) {
    const methods = p.services[service];
    const rows = [];
    for (const method of Object.keys(methods).sort()) {
      const rec = methods[method];
      const present = PRESENT.has(rec.status);
      if (availOnly && !present) continue;
      if (writesOnly && rec.risk !== "write") continue;
      if (unwrapped && !(present && rec.covered_by == null)) continue;
      if (q && !`${service}.${method}`.toLowerCase().includes(q)) continue;
      rows.push(methodRow(service, method, rec));
      shown += 1;
    }
    if (rows.length) {
      parts.push(`<section class="service"><h3>${escapeHtml(service)}` +
        `<span class="svc-count">${rows.length}</span></h3>${rows.join("")}</section>`);
    }
  }
  $("d-results").innerHTML = parts.join("") || '<p class="empty">No methods match these filters.</p>';
  $("d-count").textContent = `${shown} method${shown === 1 ? "" : "s"}`;
}

function showDetail(id) {
  const p = state.devices[id];
  if (!p) { showOverview(); return; }
  state.current = p;
  $("overview").hidden = true;
  $("detail").hidden = false;
  $("d-model").textContent = p.model;
  const avail = manifestOf(id).available_count;
  $("d-meta").textContent =
    `firmware ${p.firmware_version} · ${p.vendor || "GL.iNet"}${avail != null ? ` · ${avail} available methods` : ""}`;
  const orp = $("d-openrpc");
  orp.href = `data/openrpc/${id}.openrpc.json`;
  orp.download = `${id}.openrpc.json`;
  orp.hidden = false;
  renderCaps(p);
  renderResults();
  window.scrollTo(0, 0);
}

function showOverview() {
  $("detail").hidden = true;
  $("overview").hidden = false;
}

function applyRoute() {
  const m = location.hash.match(/^#d=(.+)$/);
  const id = m && decodeURIComponent(m[1]);
  if (id && state.devices[id]) showDetail(id);
  else showOverview();
}

// ---------- events ----------
document.addEventListener("click", (e) => {
  const nav = e.target.closest("[data-nav='overview']");
  if (nav) {
    e.preventDefault();
    const toMatrix = (nav.getAttribute("href") || "").includes("#matrix");
    if (location.hash) location.hash = "";  // -> hashchange -> showOverview()
    else showOverview();
    if (toMatrix) setTimeout(() => $("matrix").scrollIntoView({ behavior: "smooth" }), 0);
    return;
  }
  const col = e.target.closest(".model-col");
  if (col) { location.hash = "d=" + encodeURIComponent(col.dataset.id); return; }
  const method = e.target.closest(".method");
  if (method) method.classList.toggle("open");
});
for (const id of ["search", "f-available", "f-writes", "f-unwrapped"]) {
  const el = $(id);
  if (el) el.addEventListener("input", renderResults);
}
window.addEventListener("hashchange", applyRoute);

(async function init() {
  try {
    await loadAll();
  } catch (_e) {
    $("matrix-host").innerHTML = '<p class="empty">Could not load registry data.</p>';
    return;
  }
  renderHero();
  renderMatrix();
  applyRoute();
})();
