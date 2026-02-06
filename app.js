/* Gate Codes PWA
   - Loads data.csv (preferred) or data.json (fallback)
   - Fast search + category filters
   - Tap-to-copy codes with toast
*/

const DATA_SOURCES = [
  { url: './data.csv', type: 'csv', label: 'CSV' },
  { url: './data.json', type: 'json', label: 'JSON' },
];

const state = {
  data: [],             // normalized communities [{community, description, region, addresses:[...]}]
  sourceLabel: '',
  tab: 'apartments',
  query: '',
  collapsed: new Set(), // community names collapsed
};

async function loadData(){
  for (const src of DATA_SOURCES){
    try{
      const res = await fetch(src.url, { cache: 'no-store' });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      if(src.type === 'csv'){
        const text = await res.text();
        const rows = parseCSV(text);
        const grouped = groupRowsToCommunities(rows);
        state.sourceLabel = src.label;
        return grouped;
      }else{
        const json = await res.json();
        state.sourceLabel = src.label;
        return normalizeJson(json);
      }
    }catch(e){
      // try next source
      // console.warn('Data load failed:', src.url, e);
    }
  }
  state.sourceLabel = 'None';
  return [];
}

function normalizeJson(json){
  if(!Array.isArray(json)) return [];
  return json.map(c => ({
    community: c.community || 'Unknown',
    description: c.description || '',
    region: c.region || '',
    addresses: Array.isArray(c.addresses) ? c.addresses.map(a => normalizeAddress(a)) : []
  }));
}

function normalizeAddress(a){
  return {
    address: a.address || '',
    gate: a.gate || '',
    alternate: a.alternate || '',
    locker: a.locker || '',
    apartment: a.apartment || '',
    business: a.business || '',
    type: a.type || '',
    neighborhood: a.neighborhood || '',
    city: a.city || ''
  };
}

/** Minimal CSV parser with quote support */
function parseCSV(csvText){
  const lines = csvText.replace(/\r/g,'').split('\n').filter(l => l.trim() !== '');
  if(lines.length === 0) return [];
  const headers = splitCSVLine(lines[0]).map(h => h.trim());
  const out = [];

  for(let i=1; i<lines.length; i++){
    const cols = splitCSVLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => obj[h] = (cols[idx] ?? '').trim());
    out.push(obj);
  }
  return out;
}

function splitCSVLine(line){
  const result = [];
  let cur = '';
  let inQuotes = false;

  for(let i=0; i<line.length; i++){
    const ch = line[i];

    if(ch === '"'){
      if(inQuotes && line[i+1] === '"'){
        cur += '"';
        i++;
      }else{
        inQuotes = !inQuotes;
      }
      continue;
    }

    if(ch === ',' && !inQuotes){
      result.push(cur);
      cur = '';
      continue;
    }

    cur += ch;
  }
  result.push(cur);
  return result;
}

function groupRowsToCommunities(rows){
  const map = new Map();

  rows.forEach(r => {
    const community = r.community || 'Unknown';
    if(!map.has(community)){
      map.set(community, {
        community,
        description: r.description || '',
        region: r.region || '',
        addresses: []
      });
    }
    map.get(community).addresses.push(normalizeAddress({
      address: r.address,
      gate: r.gate,
      alternate: r.alternate,
      locker: r.locker,
      apartment: r.apartment,
      business: r.business,
      type: r.type,
      neighborhood: r.neighborhood,
      city: r.city
    }));
  });

  // stable sort
  return Array.from(map.values()).sort((a,b)=>a.community.localeCompare(b.community));
}

function classifyAddress(comm, addr){
  const commName = (comm.community || '').toLowerCase();
  if(commName.includes('apartment')) return 'apartments';

  const type = (addr.type || '').toLowerCase();
  if(type === 'business') return 'businesses';
  if(type === 'apartment') return 'apartments';

  // heuristic
  if(addr.business) return 'businesses';
  if(addr.apartment) return 'apartments';

  return 'residential';
}

function matchesQuery(comm, addr, q){
  if(!q) return true;
  const hay = [
    comm.community, comm.description, comm.region,
    addr.address, addr.gate, addr.alternate, addr.locker,
    addr.apartment, addr.business, addr.type,
    addr.neighborhood, addr.city
  ].join(' ').toLowerCase();
  return hay.includes(q);
}

function buildGroups(data, tab, query){
  const groups = new Map();
  const q = (query || '').trim().toLowerCase();

  for(const comm of data){
    for(const addr of comm.addresses){
      const kind = classifyAddress(comm, addr);
      if(tab !== 'all' && kind !== tab) continue;
      if(!matchesQuery(comm, addr, q)) continue;

      const key = comm.community || 'Unknown';
      if(!groups.has(key)) groups.set(key, { comm, items: [] });
      groups.get(key).items.push(addr);
    }
  }

  // turn into array sorted by community, then address
  const arr = Array.from(groups.entries())
    .sort((a,b)=>a[0].localeCompare(b[0]))
    .map(([name, v]) => ({
      name,
      comm: v.comm,
      items: v.items.sort((x,y)=>(x.address||'').localeCompare(y.address||''))
    }));

  return arr;
}

function escapeHtml(s){
  return String(s ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

function formatMeta(addr){
  const parts = [];
  if(addr.neighborhood) parts.push(addr.neighborhood);
  if(addr.city) parts.push(addr.city);
  return parts.join(' • ');
}

function render(groupArr){
  const list = document.getElementById('list');
  list.innerHTML = '';

  if(groupArr.length === 0){
    list.innerHTML = `<div class="empty">
      <div class="empty-title">No matches</div>
      <div class="muted">Try a different search (e.g., gate code, neighborhood, or a street name).</div>
    </div>`;
    return;
  }

  for(const g of groupArr){
    const groupEl = document.createElement('section');
    groupEl.className = 'group';

    const isCollapsed = state.collapsed.has(g.name);

    const header = document.createElement('button');
    header.className = 'group-header';
    header.type = 'button';
    header.innerHTML = `
      <div class="group-title">
        <span class="chev">${isCollapsed ? '▶' : '▼'}</span>
        <span>${escapeHtml(g.name)}</span>
      </div>
      <div class="group-count">${g.items.length}</div>
    `;

    const body = document.createElement('div');
    body.className = 'group-body';
    body.style.display = isCollapsed ? 'none' : 'block';

    header.addEventListener('click', ()=>{
      const nowCollapsed = body.style.display !== 'none';
      body.style.display = nowCollapsed ? 'none' : 'block';
      header.querySelector('.chev').textContent = nowCollapsed ? '▶' : '▼';
      if(nowCollapsed) state.collapsed.add(g.name);
      else state.collapsed.delete(g.name);
    });

    for(const a of g.items){
      const card = document.createElement('article');
      card.className = 'card';

      const meta = formatMeta(a);
      const hasCodes = !!(a.gate || a.alternate || a.locker);

      card.innerHTML = `
        <div class="card-top">
          <div class="addr">📍 ${escapeHtml(a.address || '(no address)')}</div>
          ${meta ? `<div class="meta">${escapeHtml(meta)}</div>` : ''}
        </div>

        ${hasCodes ? `<div class="codes">
          ${a.gate ? codeChip('Gate', a.gate) : ''}
          ${a.alternate ? codeChip('Alt', a.alternate) : ''}
          ${a.locker ? codeChip('Locker', a.locker) : ''}
        </div>` : `<div class="muted small">No codes listed</div>`}

        <div class="tag-row">
          ${tagChip(classifyAddress(g.comm, a))}
          ${a.type ? `<span class="tag tag-ghost">${escapeHtml(a.type)}</span>` : ''}
        </div>
      `;

      body.appendChild(card);
    }

    groupEl.appendChild(header);
    groupEl.appendChild(body);
    list.appendChild(groupEl);
  }
}

function codeChip(label, value){
  const safeVal = escapeHtml(value);
  const safeLabel = escapeHtml(label);
  // data-copy contains raw value via data attribute at click time
  return `<button class="chip" type="button" data-copy="${safeVal}">
    <span class="chip-label">${safeLabel}</span>
    <span class="chip-value">${safeVal}</span>
  </button>`;
}

function tagChip(kind){
  const map = {
    apartments: { text: 'Apartments', cls: 'tag-apts' },
    residential: { text: 'Residential', cls: 'tag-res' },
    businesses: { text: 'Business', cls: 'tag-biz' },
    all: { text: 'All', cls: 'tag-ghost' },
  };
  const t = map[kind] || map.residential;
  return `<span class="tag ${t.cls}">${t.text}</span>`;
}

function updateSummary(groupArr){
  let addressCount = 0;
  for(const g of groupArr) addressCount += g.items.length;

  const summary = document.getElementById('summary');
  const q = state.query.trim();
  const qPart = q ? ` • search: “${escapeHtml(q)}”` : '';
  summary.innerHTML = `
    <span><strong>${addressCount}</strong> address${addressCount===1?'':'es'}</span>
    <span class="dot">•</span>
    <span><strong>${groupArr.length}</strong> group${groupArr.length===1?'':'s'}</span>
    ${qPart ? `<span class="dot">•</span><span>${qPart}</span>` : ''}
  `;
}

function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(()=>t.classList.remove('show'), 1300);
}

async function copyText(text){
  try{
    await navigator.clipboard.writeText(text);
    return true;
  }catch(e){
    // fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try{
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    }catch(_){
      document.body.removeChild(ta);
      return false;
    }
  }
}

function wireCopyHandlers(){
  document.addEventListener('click', async (e)=>{
    const btn = e.target.closest('button[data-copy]');
    if(!btn) return;
    const val = btn.getAttribute('data-copy') || '';
    const ok = await copyText(val);
    toast(ok ? `Copied: ${val}` : 'Copy failed');
  });
}

function renderAll(){
  const groups = buildGroups(state.data, state.tab, state.query);
  updateSummary(groups);
  render(groups);
}

function setTab(newTab, el){
  state.tab = newTab;
  document.querySelectorAll('.tab').forEach(t=>{
    const active = t === el;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  renderAll();
}

function debounce(fn, ms){
  let timer;
  return (...args)=>{
    clearTimeout(timer);
    timer = setTimeout(()=>fn(...args), ms);
  };
}

function setNetworkBadge(){
  const badge = document.getElementById('netBadge');
  const online = navigator.onLine;
  badge.classList.toggle('badge-online', online);
  badge.classList.toggle('badge-offline', !online);
  badge.title = online ? 'Online' : 'Offline';
}

async function init(){
  // SW
  if('serviceWorker' in navigator){
    try{ await navigator.serviceWorker.register('./service-worker.js'); }catch(_){}
  }

  setNetworkBadge();
  window.addEventListener('online', setNetworkBadge);
  window.addEventListener('offline', setNetworkBadge);

  wireCopyHandlers();

  state.data = await loadData();

  const ds = document.getElementById('dataSource');
  ds.textContent = state.sourceLabel ? ` Data: ${state.sourceLabel}` : '';

  // tabs
  document.querySelectorAll('.tab').forEach(t=>{
    t.addEventListener('click', ()=>setTab(t.dataset.tab, t));
  });

  // search
  const search = document.getElementById('search');
  const clearBtn = document.getElementById('clearBtn');

  const onSearch = debounce(()=>{
    state.query = search.value || '';
    renderAll();
  }, 120);

  search.addEventListener('input', onSearch);
  clearBtn.addEventListener('click', ()=>{
    search.value = '';
    state.query = '';
    renderAll();
    search.focus();
  });

  renderAll();
}

document.addEventListener('DOMContentLoaded', init);
