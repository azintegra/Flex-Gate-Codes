async function loadData() {
  try {
    const res = await fetch('./data.json', { cache: 'no-store' });

    if (!res.ok) {
      throw new Error(`Failed to load data.json – ${res.status} ${res.statusText}`);
    }
    return await res.json();
  } catch (err) {
    const summary = document.getElementById('summary');
    if (summary) summary.textContent = 'Failed to load data. Please try again later.';
    console.error('Data load error:', err);
    throw err;
  }
}

function debounce(fn, delay = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function safeStr(v) {
  return (v === null || v === undefined) ? '' : String(v);
}

function cleanCommunityLabel(label) {
  // Remove trailing " (85755)" type suffixes
  const s = safeStr(label).trim();
  return s.replace(/\s*\(\d{5}\)\s*$/,'').trim();
}

function normalizeCommunity(label) {
  const v = cleanCommunityLabel(label);
  if (!v) return '';
  // Normalize dash style
  return v.replace(/\s+-\s+/g, ' — ');
}

function showToast(message, duration = 1800) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), duration);
}

async function copyToClipboard(text, label = 'Copied') {
  const v = safeStr(text).trim();
  if (!v) return;
  try {
    await navigator.clipboard.writeText(v);
    showToast(label);
  } catch (e) {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = v;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast(label);
  }
}

function classifyAddress(addr) {
  const apartment = safeStr(addr.apartment).trim();
  const type = safeStr(addr.type).trim().toLowerCase(); // optional
  const business = safeStr(addr.business).trim();
  if (type === 'business') return 'businesses';
  if (type === 'apartment') return 'apartments';
  if (type === 'residential') return 'residential';
  if (business) return 'businesses';
  if (apartment) return 'apartments';
  return 'residential';
}

function getSearchHaystack(comm, addr) {
  const parts = [
    normalizeCommunity(comm.community),
    safeStr(addr.address),
    safeStr(addr.address_raw),
    safeStr(addr.apartment),
    safeStr(addr.neighborhood),
    safeStr(addr.city),
    safeStr(addr.gate),
    safeStr(addr.alternate),
    safeStr(addr.locker),
    safeStr(addr.business),
    safeStr(addr.notes)
  ];
  return parts.join(' ').toLowerCase();
}

function filterData(data, term, tab) {
  const t = (term || '').trim().toLowerCase();

  const filtered = data.map(comm => {
    const addresses = (comm.addresses || []).filter(addr => {
      const kind = classifyAddress(addr);
      if (tab !== 'all' && kind !== tab) return false;
      if (!t) return true;
      return getSearchHaystack(comm, addr).includes(t);
    });
    return { ...comm, addresses };
  }).filter(comm => comm.addresses.length > 0);

  return filtered;
}

function buildGroups(flattened, tab) {
  // Groups:
  // - Apartments: by apartment name (never ZIP)
  // - Businesses: by business name (or community as fallback)
  // - Residential/All: by neighborhood if present, else by community (never ZIP)
  const groups = new Map();

  for (const comm of flattened) {
    const commLabel = normalizeCommunity(comm.community);

    for (const addr of comm.addresses) {
      const kind = classifyAddress(addr);

      // Only build groups for the current tab slice (caller already filtered,
      // but All can include everything)
      if (tab !== 'all' && kind !== tab) continue;

      const apt = safeStr(addr.apartment).trim();
      const neighborhood = normalizeCommunity(addr.neighborhood);
      const city = safeStr(addr.city).trim();
      const biz = safeStr(addr.business).trim();

      let groupName = '';
      let groupMeta = '';

      if (kind === 'apartments') {
        groupName = normalizeCommunity(apt) || commLabel || 'Apartments';
        groupMeta = [city, neighborhood].filter(Boolean).join(' • ');
      } else if (kind === 'businesses') {
        groupName = normalizeCommunity(biz) || commLabel || 'Businesses';
        groupMeta = city || '';
      } else {
        groupName = neighborhood || commLabel || 'Other';
        groupMeta = city || '';
      }

      const key = groupName.toLowerCase().replace(/\s+/g, ' ').trim();

      if (!groups.has(key)) {
        groups.set(key, { name: groupName, meta: groupMeta, items: [] });
      } else {
        const g = groups.get(key);
        if (!g.meta && groupMeta) g.meta = groupMeta;
      }
      groups.get(key).items.push({ ...addr });
    }
  }

  return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function renderSummary(groups, tab) {
  const summary = document.getElementById('summary');
  const totalGroups = groups.length;
  const totalAddresses = groups.reduce((sum, g) => sum + g.items.length, 0);

  const label =
    tab === 'apartments' ? 'Apartments' :
    tab === 'residential' ? 'Residential' :
    tab === 'businesses' ? 'Businesses' :
    'All';

  summary.innerHTML = `${label}: <strong>${totalAddresses}</strong> addresses in <strong>${totalGroups}</strong> groups`;
}

function pillHtml(kind, label, value) {
  const v = safeStr(value).trim();
  if (!v) return '';
  const cls = kind === 'gate' ? 'gate' : kind === 'alt' ? 'alt' : 'locker';
  const copyLabel =
    kind === 'gate' ? 'Gate copied' :
    kind === 'alt' ? 'Alt code copied' :
    'Locker copied';

  return `
    <span class="code-pill ${cls}">
      ${label}: <strong>${v}</strong>
      <button class="copy-btn" data-copy="${encodeURIComponent(v)}" data-toast="${copyLabel}" aria-label="Copy ${label}" type="button">⧉</button>
    </span>
  `;
}

function mapsUrlFor(item) {
  const address = safeStr(item.address).trim() || safeStr(item.address_raw).trim();
  const city = safeStr(item.city).trim();
  const extra = safeStr(item.business).trim() || safeStr(item.apartment).trim();
  const query = [address, extra, city].filter(Boolean).join(' ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function renderList(groups) {
  const list = document.getElementById('list');
  list.innerHTML = '';

  if (!groups.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No matches.';
    list.appendChild(empty);
    return;
  }

  groups.forEach((g, idx) => {
    const group = document.createElement('section');
    group.className = 'group';

    const header = document.createElement('div');
    header.className = 'group-header';
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');

    // ARIA expand/collapse wiring
    header.setAttribute('aria-expanded', 'false');
    header.setAttribute('aria-controls', `group-body-${idx}`);

    const titleWrap = document.createElement('div');
    titleWrap.className = 'group-title';

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = g.name;

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = g.meta || '';

    titleWrap.appendChild(name);
    if (g.meta) titleWrap.appendChild(meta);

    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.alignItems = 'center';

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = `${g.items.length}`;

    const chev = document.createElement('span');
    chev.className = 'chev';
    chev.textContent = '▸'; // collapsed by default

    right.appendChild(badge);
    right.appendChild(chev);

    header.appendChild(titleWrap);
    header.appendChild(right);

    const body = document.createElement('div');
    body.className = 'group-body';
    body.id = `group-body-${idx}`;
    body.setAttribute('role', 'region');
    body.style.display = 'none'; // collapsed by default

    g.items.forEach(item => {
      const addrDiv = document.createElement('div');
      addrDiv.className = 'address';

      const addrLine = document.createElement('div');
      addrLine.className = 'addr-line';

      const addrRow = document.createElement('div');
      addrRow.className = 'addr-row';

      const addrText = document.createElement('div');
      addrText.className = 'addr-text';
      addrText.textContent = `📍 ${safeStr(item.address).trim() || safeStr(item.address_raw).trim()}`;

      const mapsLink = document.createElement('a');
      mapsLink.className = 'maps-link';
      mapsLink.href = mapsUrlFor(item);
      mapsLink.target = '_blank';
      mapsLink.rel = 'noopener';
      mapsLink.textContent = 'Maps';

      addrRow.appendChild(addrText);
      addrRow.appendChild(mapsLink);
      addrLine.appendChild(addrRow);

      // Secondary line rules:
      // - NEVER show ZIP
      // - NEVER show "Central Tucson — Urban Apartments" repeated per row
      // - Only show if it adds info (not equal to group name)
      const nb = normalizeCommunity(item.neighborhood);
      const cityLine = safeStr(item.city).trim();
      const groupName = normalizeCommunity(g.name);

      const parts = [];
      if (nb && nb !== groupName) parts.push(nb);
      // city helps, but avoid clutter: only show if it’s not identical to nb/group
      if (cityLine && cityLine !== groupName && cityLine !== nb) parts.push(cityLine);

      if (parts.length) {
        const note = document.createElement('div');
        note.className = 'small-note';
        note.textContent = parts.join(' • ');
        addrLine.appendChild(note);
      }

      addrDiv.appendChild(addrLine);

      const codes = document.createElement('div');
      codes.className = 'codes';
      codes.innerHTML =
        pillHtml('gate', 'Gate', item.gate) +
        pillHtml('alt', 'Alt', item.alternate) +
        pillHtml('locker', 'Locker', item.locker);

      if (codes.innerHTML.trim()) addrDiv.appendChild(codes);
      body.appendChild(addrDiv);
    });

    group.appendChild(header);
    group.appendChild(body);

    function setExpanded(expand) {
      body.style.display = expand ? '' : 'none';
      chev.textContent = expand ? '▾' : '▸';
      header.setAttribute('aria-expanded', expand ? 'true' : 'false');
    }

    function toggle() {
      const isHidden = body.style.display === 'none';
      setExpanded(isHidden);
    }

    header.addEventListener('click', toggle);
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });

    list.appendChild(group);
  });

  // Copy handler (event delegation)
  list.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const text = decodeURIComponent(btn.dataset.copy || '');
      const toast = btn.dataset.toast || 'Copied';
      if (!text) return;
      await copyToClipboard(text, toast);
    });
  });
}

function setActiveTab(tab) {
  document.querySelectorAll('.tab').forEach(b => {
    const isActive = b.dataset.tab === tab;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  let data = [];
  let activeTab = 'apartments'; // default tab

  const searchEl = document.getElementById('search');
  const listEl = document.getElementById('list');

  try {
    if (listEl) listEl.innerHTML = '<div class="loading">Loading...</div>';
    data = await loadData();
  } catch (e) {
    console.error(e);
    return;
  }

  function refresh() {
    const filtered = filterData(data, searchEl.value, activeTab);
    const groups = buildGroups(filtered, activeTab);
    renderSummary(groups, activeTab);
    renderList(groups);
  }

  // Tabs
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      setActiveTab(activeTab);
      refresh();
    });
  });

  // Search (debounced)
  searchEl.addEventListener('input', debounce(refresh, 200));

  // Initial render
  setActiveTab(activeTab);
  refresh();

  // PWA service worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch(() => {});
    });
  }
});
