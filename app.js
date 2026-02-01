/* Flex Gate Codes PWA (HOA-only grouping)
   - Uses data.json unchanged
   - Groups Residential by HOA/community ONLY
   - Apartments by community (complex name)
   - Businesses by community (business name) else "Businesses"
   - Never uses neighborhood as a group header
*/

const STATE = {
  all: [],
  filter: "residential",
  query: "",
  expanded: new Set(),
};

const $ = (id) => document.getElementById(id);

function norm(s) {
  return (s ?? "").toString().trim();
}

function normCode(s) {
  const c = norm(s);
  return c.replace(/^#\s*/, "");
}

function guessType(row) {
  // Prefer explicit type if present; else infer from fields
  const t = norm(row.type).toLowerCase();
  if (t) return t;

  // Heuristics: apartment/apt/unit keywords + community looks like complex
  const addr = norm(row.address).toLowerCase();
  const comm = norm(row.community).toLowerCase();
  if (addr.includes(" apt ") || addr.includes(" apartment") || addr.includes(" unit ") || comm.includes("apartments") || comm.includes("apartment")) {
    return "apartments";
  }
  // If community contains common business words and address is commercial-ish
  if (comm.includes("llc") || comm.includes("plumbing") || comm.includes("supply") || comm.includes("market") || comm.includes("store")) {
    return "businesses";
  }
  return "residential";
}

function matches(row, q) {
  if (!q) return true;
  const hay = [
    row.address,
    row.community,
    row.neighborhood,
    row.city,
    row.gate_code,
    row.code,
    row.tip
  ].map(norm).join(" ").toLowerCase();
  return hay.includes(q);
}

function mapsLink(address) {
  const q = encodeURIComponent(address);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

function rowToView(row) {
  const address = norm(row.address);
  const community = norm(row.community);
  const neighborhood = norm(row.neighborhood);
  const city = norm(row.city);
  const gate = normCode(row.gate_code || row.code);
  const tip = norm(row.tip);

  const type = guessType(row);
  return { ...row, address, community, neighborhood, city, gate, tip, type };
}

async function loadData() {
  // Hard no-cache + cache-busting to prevent stale HOA names
  const url = `./data.json?v=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load data.json");
  const raw = await res.json();
  STATE.all = raw.map(rowToView);
}

function setActivePill(filter) {
  document.querySelectorAll(".pill").forEach((b) => {
    b.classList.toggle("active", b.dataset.filter === filter);
  });
}

function filteredRows() {
  const q = STATE.query.toLowerCase().trim();
  const f = STATE.filter;

  let rows = STATE.all;

  if (f !== "all") {
    rows = rows.filter(r => r.type === f);
  }
  rows = rows.filter(r => matches(r, q));

  return rows;
}

function groupKey(row) {
  const comm = norm(row.community);
  const city = norm(row.city);
  const type = row.type;

  if (type === "businesses") {
    return comm || "Businesses";
  }
  // Apartments & Residential: HOA/complex name only
  return comm || "Other";
}

function groupMetaFor(groupName, rows) {
  // Keep meta minimal: show city if consistent
  const cities = new Set(rows.map(r => norm(r.city)).filter(Boolean));
  if (cities.size === 1) return [...cities][0];
  if (cities.size > 1) return "Multiple cities";
  return "";
}

function render() {
  const groupsEl = $("groups");
  const summaryEl = $("summary");
  groupsEl.innerHTML = "";

  const rows = filteredRows();

  // Group
  const map = new Map();
  for (const r of rows) {
    const k = groupKey(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }

  // Sort groups by size desc then name
  const groups = [...map.entries()].sort((a,b) => {
    const d = b[1].length - a[1].length;
    if (d) return d;
    return a[0].localeCompare(b[0]);
  });

  // Summary
  const filterLabel = STATE.filter === "all"
    ? "All"
    : (STATE.filter[0].toUpperCase() + STATE.filter.slice(1));
  summaryEl.textContent = `${filterLabel}: ${rows.length} addresses in ${groups.length} groups`;

  const groupTpl = document.getElementById("groupTpl");
  const itemTpl = document.getElementById("itemTpl");

  for (const [name, items] of groups) {
    const node = groupTpl.content.cloneNode(true);
    const card = node.querySelector(".group-card");
    const head = node.querySelector(".group-head");
    const title = node.querySelector(".group-title");
    const badge = node.querySelector(".badge");
    const meta = node.querySelector(".group-meta");
    const list = node.querySelector(".items");
    const chev = node.querySelector(".chev");

    title.textContent = name;
    badge.textContent = items.length;

    const m = groupMetaFor(name, items);
    meta.textContent = m;

    const expanded = STATE.expanded.has(name);
    list.style.display = expanded ? "block" : "none";
    chev.textContent = expanded ? "⌄" : "›";

    head.addEventListener("click", () => {
      if (STATE.expanded.has(name)) STATE.expanded.delete(name);
      else STATE.expanded.add(name);
      render();
    });

    // Sort items by address
    items.sort((a,b) => a.address.localeCompare(b.address));

    for (const r of items) {
      const it = itemTpl.content.cloneNode(true);
      it.querySelector(".addr").textContent = r.address;
      const subParts = [r.city].filter(Boolean);
      it.querySelector(".item-sub").textContent = subParts.join(" • ");

      it.querySelector(".code").textContent = r.gate || "";
      const copyBtn = it.querySelector(".copy");
      copyBtn.addEventListener("click", async () => {
        const val = r.gate || "";
        try {
          await navigator.clipboard.writeText(val);
          copyBtn.textContent = "✓";
          setTimeout(() => (copyBtn.textContent = "⧉"), 900);
        } catch {
          // Fallback
          const ta = document.createElement("textarea");
          ta.value = val;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
          copyBtn.textContent = "✓";
          setTimeout(() => (copyBtn.textContent = "⧉"), 900);
        }
      });

      const maps = it.querySelector(".maps");
      maps.href = mapsLink(r.address);

      list.appendChild(it);
    }

    groupsEl.appendChild(node);
  }
}

function bindUI() {
  // Filter pills
  document.querySelectorAll(".pill").forEach((b) => {
    b.addEventListener("click", () => {
      STATE.filter = b.dataset.filter;
      setActivePill(STATE.filter);
      // reset expansions on filter change for clarity
      STATE.expanded.clear();
      render();
    });
  });

  // Default pill
  setActivePill(STATE.filter);

  // Search
  $("q").addEventListener("input", (e) => {
    STATE.query = e.target.value || "";
    // Expand first few groups when searching for speed
    if (STATE.query.trim().length >= 2) {
      const rows = filteredRows();
      const keys = [];
      const seen = new Set();
      for (const r of rows) {
        const k = groupKey(r);
        if (!seen.has(k)) {
          keys.push(k);
          seen.add(k);
        }
        if (keys.length >= 6) break;
      }
      STATE.expanded = new Set(keys);
    } else {
      STATE.expanded.clear();
    }
    render();
  });
}

(async function init() {
  try {
    bindUI();
    await loadData();
    render();
  } catch (e) {
    console.error(e);
    const groupsEl = $("groups");
    groupsEl.innerHTML = `<div class="error">Could not load data. Refresh and try again.</div>`;
  }
})();
