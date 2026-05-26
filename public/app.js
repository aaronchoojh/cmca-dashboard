// ─── Config ───────────────────────────────────────────────────────────────────
// These are set as Netlify environment variables — never hardcode secrets here.
// SHEET_ID and API_KEY are injected by the Netlify function (sheets.js).
// The frontend calls /.netlify/functions/sheets for all sheet operations.

const today = new Date();
let data = [];
let sortKey = 'due', sortDir = 1;

// ─── Sheet API via Netlify Function ───────────────────────────────────────────
async function apiCall(action, payload = {}) {
  const res = await fetch('/.netlify/functions/sheets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

async function loadFromSheets() {
  setSyncStatus('loading', 'Syncing...');
  document.getElementById('error-area').innerHTML = '';
  try {
    const { rows } = await apiCall('read');
    parseSheetRows(rows);
    setSyncStatus('ok', `Synced · ${new Date().toLocaleTimeString()}`);
    render();
  } catch (e) {
    setSyncStatus('err', 'Sync failed');
    showError(`Could not load from Google Sheets: ${e.message}`);
    render();
  }
}

// ─── Sheet Row Parser ─────────────────────────────────────────────────────────
function parseDate(str) {
  if (!str) return '';
  const s = str.trim();
  // ISO format already
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const months = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
  const parts = s.split(/[\s\/\-]/);
  if (parts.length < 3) return '';
  let d, m, y;
  if (isNaN(parts[1])) {
    d = parseInt(parts[0]); m = months[parts[1].toLowerCase().slice(0,3)]; y = parseInt(parts[2]);
  } else if (parts[0].length === 4) {
    y = parseInt(parts[0]); m = parseInt(parts[1])-1; d = parseInt(parts[2]);
  } else {
    d = parseInt(parts[0]); m = parseInt(parts[1])-1; y = parseInt(parts[2]);
  }
  if (isNaN(d)||isNaN(m)||isNaN(y)) return '';
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function parseSheetRows(rows) {
  const parsed = [];
  let currentStatus = 'Active';
  let id = 0;
  for (let sheetRow = 0; sheetRow < rows.length; sheetRow++) {
    const row = rows[sheetRow];
    if (!row[0]) continue;
    const first = (row[0]||'').trim();
    if (['Monthly','Yearly','CEX/DEX'].includes(first)) continue;
    if (first.toLowerCase().includes('paused') || first.toLowerCase().includes('dropped')) {
      currentStatus = 'Paused'; continue;
    }
    if (first === 'CEX' || first === 'DEX') {
      parsed.push({
        id: id++,
        type: first,
        name: (row[1]||'').trim(),
        tier: (row[2]||'Silver').trim(),
        term: (row[3]||'Monthly').trim(),
        contract: (row[4]||'').trim().split('\n')[0].trim(),
        renewal: parseDate(row[5]||''),
        due: parseDate(row[6]||''),
        status: (row[7]||'').trim() || currentStatus,
        _rowIndex: sheetRow + 1, // actual 1-based sheet row number
      });
    }
  }
  data = parsed.filter(r => r.name);
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────
function setSyncStatus(type, msg) {
  const el = document.getElementById('sync-status');
  el.className = 'sync-status ' + type;
  const icon = type === 'ok' ? 'check' : type === 'err' ? 'alert-circle' : 'refresh';
  el.innerHTML = `<i class="ti ti-${icon}"></i> ${msg}`;
}

function showError(msg) {
  document.getElementById('error-area').innerHTML =
    `<div class="error-banner"><i class="ti ti-alert-circle"></i> ${msg}</div>`;
}

function daysDiff(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return Math.round((d - today) / 86400000);
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return d + ' ' + months[m-1] + ' ' + y;
}

// ─── Render ───────────────────────────────────────────────────────────────────
function renderCards() {
  const active = data.filter(r => r.status === 'Active');
  const gold = active.filter(r => r.tier === 'Gold').length;
  const silver = active.filter(r => r.tier === 'Silver').length;
  const monthly = active.filter(r => r.term === 'Monthly').length;
  const yearly = active.filter(r => r.term === 'Yearly').length;
  const paused = data.filter(r => r.status === 'Paused').length;
  document.getElementById('cards').innerHTML = `
    <div class="card"><div class="label">Total subscribers</div><div class="value">${data.length}</div><div class="sub">all statuses</div></div>
    <div class="card accent-green"><div class="label">Active</div><div class="value">${active.length}</div><div class="sub">${paused} paused</div></div>
    <div class="card accent-gold"><div class="label">Gold tier</div><div class="value">${gold}</div><div class="sub">active only</div></div>
    <div class="card"><div class="label">Silver tier</div><div class="value">${silver}</div><div class="sub">active only</div></div>
    <div class="card accent-blue"><div class="label">Yearly plans</div><div class="value">${yearly}</div><div class="sub">active only</div></div>
    <div class="card"><div class="label">Monthly plans</div><div class="value">${monthly}</div><div class="sub">active only</div></div>`;
}

function renderRenewals() {
  const upcoming = data
    .filter(r => r.status === 'Active' && r.due)
    .map(r => ({ ...r, days: daysDiff(r.due) }))
    .filter(r => r.days !== null && r.days >= 0 && r.days <= 60)
    .sort((a, b) => a.days - b.days);

  if (!upcoming.length) {
    document.getElementById('renewals-bar').innerHTML =
      '<span style="font-size:13px;color:var(--text2)">No renewals in the next 60 days</span>';
    return;
  }
  document.getElementById('renewals-bar').innerHTML = upcoming.map(r => {
    const cls = r.days <= 7 ? 'urgent' : r.days <= 14 ? 'soon' : '';
    const label = r.days === 0 ? 'Today' : r.days === 1 ? 'Tomorrow' : `In ${r.days} days`;
    return `<div class="renewal-chip ${cls}">
      <div class="ex">${r.name}</div>
      <div class="date">${fmtDate(r.due)}</div>
      <div class="days">${label} · ${r.tier} ${r.term}</div>
    </div>`;
  }).join('');
}

function getFiltered() {
  const search = document.getElementById('search').value.toLowerCase();
  const fStatus = document.getElementById('f-status').value;
  const fTier = document.getElementById('f-tier').value;
  const fTerm = document.getElementById('f-term').value;
  const fType = document.getElementById('f-type').value;
  const filtered = data.filter(r => {
    if (search && !r.name.toLowerCase().includes(search)) return false;
    if (fStatus && r.status !== fStatus) return false;
    if (fTier && r.tier !== fTier) return false;
    if (fTerm && r.term !== fTerm) return false;
    if (fType && r.type !== fType) return false;
    return true;
  });
  if (sortKey === 'due') {
    const statusOrder = { 'Active': 0, 'Pending': 1, 'Paused': 2 };
    const termOrder = { 'Monthly': 0, 'Yearly': 1 };
    return filtered.sort((a, b) => {
      const aSO = statusOrder[a.status] ?? 9, bSO = statusOrder[b.status] ?? 9;
      if (aSO !== bSO) return aSO - bSO;
      if (a.status === 'Active' && b.status === 'Active') {
        const aTO = termOrder[a.term] ?? 9, bTO = termOrder[b.term] ?? 9;
        if (aTO !== bTO) return aTO - bTO;
      }
      const ad = a.due || 'zzzz', bd = b.due || 'zzzz';
      return ad < bd ? -1 : ad > bd ? 1 : 0;
    });
  }
  return filtered.sort((a, b) => {
    const av = a[sortKey] || '', bv = b[sortKey] || '';
    return av < bv ? -sortDir : av > bv ? sortDir : 0;
  });
}

function render() {
  renderCards();
  renderRenewals();
  const rows = getFiltered();
  document.getElementById('count-bar').textContent = `Showing ${rows.length} of ${data.length} subscribers`;
  ['name','type','tier','term','renewal','due','status'].forEach(k => {
    const el = document.getElementById('s-' + k);
    if (el) el.textContent = sortKey === k ? (sortDir === 1 ? '↑' : '↓') : '';
  });
  document.getElementById('tbody').innerHTML = rows.map(r => {
    const days = daysDiff(r.due);
    const urgentStyle = days !== null && days <= 7 && r.status === 'Active'
      ? 'style="color:var(--danger-text);font-weight:600"'
      : days !== null && days <= 14 && r.status === 'Active'
      ? 'style="color:var(--warning-text)"' : '';
    return `<tr>
      <td style="font-weight:500">${r.name}</td>
      <td><span class="badge ${r.type.toLowerCase()}">${r.type}</span></td>
      <td><span class="badge ${r.tier.toLowerCase()}">${r.tier}</span></td>
      <td><span class="badge ${r.term.toLowerCase()}">${r.term}</span></td>
      <td style="color:var(--text2);font-size:12px">${fmtDate(r.renewal)}</td>
      <td ${urgentStyle}>${fmtDate(r.due)}</td>
      <td><span class="badge ${r.status.toLowerCase()}">${r.status}</span></td>
      <td>${r.contract
        ? `<a href="${r.contract}" target="_blank" rel="noopener" style="color:var(--info-text);font-size:12px;text-decoration:none"><i class="ti ti-external-link"></i> View</a>`
        : '<span style="color:var(--text3);font-size:12px">—</span>'}</td>
      <td style="white-space:nowrap">
        <button class="act-btn" onclick="openEdit(${r.id})" title="Edit"><i class="ti ti-edit"></i></button>
        <button class="act-btn" onclick="openDelete(${r.id})" title="Delete"><i class="ti ti-trash"></i></button>
      </td></tr>`;
  }).join('');
}

function sortBy(key) {
  if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = 1; }
  render();
}

function clearFilters() {
  document.getElementById('search').value = '';
  ['f-status','f-tier','f-term','f-type'].forEach(id => document.getElementById(id).value = '');
  render();
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function openModal(html) {
  document.getElementById('modal-box').innerHTML = html;
  document.getElementById('modal-bg').style.display = 'flex';
}
function closeModal() { document.getElementById('modal-bg').style.display = 'none'; }

function formHTML(title, vals, submitFn) {
  const sel = (id, options, val) =>
    `<select id="${id}">${options.map(o => `<option${o===val?' selected':''}>${o}</option>`).join('')}</select>`;
  return `<h2>${title}</h2>
  <div class="form-grid">
    <div class="form-row" style="grid-column:1/-1">
      <label>Exchange name</label>
      <input id="f-name" value="${vals.name||''}" placeholder="e.g. Binance" />
    </div>
    <div class="form-row"><label>Type</label>${sel('f-type-m',['CEX','DEX'],vals.type)}</div>
    <div class="form-row"><label>Tier</label>${sel('f-tier-m',['Gold','Silver','Bronze'],vals.tier)}</div>
    <div class="form-row"><label>Term</label>${sel('f-term-m',['Monthly','Yearly'],vals.term)}</div>
    <div class="form-row"><label>Status</label>${sel('f-status-m',['Active','Pending','Paused'],vals.status)}</div>
    <div class="form-row"><label>Current cycle date</label><input type="date" id="f-renewal" value="${vals.renewal||''}" /></div>
    <div class="form-row"><label>Renewal due date</label><input type="date" id="f-due" value="${vals.due||''}" /></div>
    <div class="form-row" style="grid-column:1/-1">
      <label>Contract link (Google Drive)</label>
      <input id="f-contract" value="${vals.contract||''}" placeholder="https://drive.google.com/..." />
    </div>
  </div>
  <div class="modal-actions">
    <button class="btn" onclick="closeModal()">Cancel</button>
    <button class="btn primary" onclick="${submitFn}">Save</button>
  </div>`;
}

function getFormVals() {
  return {
    name:     document.getElementById('f-name').value.trim(),
    type:     document.getElementById('f-type-m').value,
    tier:     document.getElementById('f-tier-m').value,
    term:     document.getElementById('f-term-m').value,
    status:   document.getElementById('f-status-m').value,
    renewal:  document.getElementById('f-renewal').value,
    due:      document.getElementById('f-due').value,
    contract: document.getElementById('f-contract').value.trim(),
  };
}

// ─── Add ──────────────────────────────────────────────────────────────────────
function openAdd() {
  openModal(formHTML('Add subscriber', { type:'CEX', tier:'Silver', term:'Monthly', status:'Active' }, 'saveAdd()'));
}

async function saveAdd() {
  const r = getFormVals();
  if (!r.name) { alert('Exchange name is required'); return; }
  closeModal();
  setSyncStatus('loading', 'Saving...');
  try {
    await apiCall('append', { row: [r.type, r.name, r.tier, r.term, r.contract, r.renewal, r.due, r.status] });
    await loadFromSheets();
  } catch (e) {
    showError(`Could not save to sheet: ${e.message}`);
    setSyncStatus('err', 'Save failed');
  }
}

// ─── Edit ─────────────────────────────────────────────────────────────────────
function openEdit(id) {
  const r = data.find(x => x.id === id);
  openModal(formHTML('Edit subscriber', r, `saveEdit(${id})`));
}

async function saveEdit(id) {
  const r = { ...data.find(x => x.id === id), ...getFormVals() };
  closeModal();
  setSyncStatus('loading', 'Updating...');
  try {
    await apiCall('update', {
      rowIndex: r._rowIndex,
      row: [r.type, r.name, r.tier, r.term, r.contract, r.renewal, r.due, r.status]
    });
    await loadFromSheets();
  } catch (e) {
    showError(`Could not update sheet: ${e.message}`);
    setSyncStatus('err', 'Update failed');
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────
function openDelete(id) {
  const r = data.find(x => x.id === id);
  openModal(`<div class="del-confirm">
    <p>Remove <strong>${r.name}</strong> from the subscriber list? This will delete the row from your Google Sheet.</p>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn danger" onclick="confirmDelete(${id})"><i class="ti ti-trash"></i> Remove</button>
    </div>
  </div>`);
}

async function confirmDelete(id) {
  const r = data.find(x => x.id === id);
  closeModal();
  setSyncStatus('loading', 'Deleting...');
  try {
    await apiCall('delete', { rowIndex: r._rowIndex });
    await loadFromSheets();
  } catch (e) {
    showError(`Could not delete from sheet: ${e.message}`);
    setSyncStatus('err', 'Delete failed');
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
loadFromSheets();
