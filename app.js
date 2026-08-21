/* ------------------------------------------------------------------
   Pathway Data Validation build -- exact-layout version.
   Loads data/jobs.json, data/cities.json, data/state_abbrev.json,
   and data/results.csv (swap that file in and refresh -- no build
   step). Never fabricates numbers: an empty results.csv renders
   honest empty states, not placeholder data.
------------------------------------------------------------------- */

const state = {
  jobs: [],
  cities: [],
  stateAbbrev: {},
  results: [],
  selectedJobRank: null,
  selectedCity: null,   // {city, state} or null
  selectedState: null,  // state name or null
};

// ---------- CSV parser (handles quoted fields with embedded commas,
// e.g. the job name "Physicians, Pathologists") ----------
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1).map(r => {
    const obj = {};
    header.forEach((h, idx) => { obj[h] = r[idx]; });
    return obj;
  });
}

async function loadData() {
  const [jobs, cities, stateAbbrev, resultsText] = await Promise.all([
    fetch('data/jobs.json').then(r => r.json()),
    fetch('data/cities.json').then(r => r.json()),
    fetch('data/state_abbrev.json').then(r => r.json()),
    fetch('data/results.csv').then(r => r.text()).catch(() => ''),
  ]);

  state.jobs = jobs;
  state.cities = cities;
  state.stateAbbrev = stateAbbrev;

  const rows = parseCSV(resultsText);
  state.hasSalaryData = rows.length > 0 && rows[0].average_salary !== undefined;
  state.results = rows
    .filter(r => r.job_rank && r.city)
    .map(r => ({
      city: r.city, state: r.state,
      jobRank: parseInt(r.job_rank, 10), jobName: r.job_name, onetCode: r.onet_code,
      count: parseInt(r.jobspecker_job_count, 10) || 0,
      avgSalary: parseFloat(r.average_salary) || null,
      fetchedAt: r.fetched_at,
    }));

  renderLastUpdated();
  const salaryJob = state.jobs.find(j => jobHasSalary(j.rank));
  state.selectedJobRank = salaryJob ? salaryJob.rank : (state.jobs.length ? state.jobs[0].rank : null);
  syncJobInput();
  renderAll();
}

function renderLastUpdated() {
  const dot = document.getElementById('footDot');
  const el = document.getElementById('lastUpdated');
  if (!state.results.length) {
    el.textContent = 'No results loaded yet';
    dot.style.background = 'var(--border-dashed)';
    return;
  }
  const times = state.results.map(r => r.fetchedAt).filter(Boolean).sort();
  const latest = times[times.length - 1];
  el.textContent = latest ? `Data as of ${latest} (${state.results.length.toLocaleString()} rows)` : `${state.results.length.toLocaleString()} rows loaded`;
}

// ---------------------------------------------------------------
// Typeahead: generic open/filter/select behaviour
// ---------------------------------------------------------------
function setupTypeahead({ inputId, dropdownId, showAllOnFocus, minChars, getItems, renderItem, onSelect, onClear, displayValue, clearable }) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  const field = input.closest('.field');
  let activeIndex = -1;
  let currentItems = [];
  let lastValue = input.value || '';

  // clear/cancel (x) button -- shown only while actively editing (dropdown
  // open). Click reverts the input back to the last committed value,
  // exactly like pressing Escape.
  const xBtn = document.createElement('span');
  xBtn.className = 'ta-clear-btn';
  xBtn.innerHTML = '&times;';
  field.appendChild(xBtn);
  xBtn.addEventListener('mousedown', (e) => { e.preventDefault(); revert(); input.blur(); });

  function open(items) {
    currentItems = items;
    activeIndex = -1;
    dropdown.innerHTML = items.length
      ? items.map((item, i) => renderItem(item, i)).join('')
      : '<div class="dropdown-empty">No matches</div>';
    dropdown.classList.add('open');
    field.classList.add('editing');
  }
  function close() {
    dropdown.classList.remove('open');
    currentItems = []; activeIndex = -1;
    field.classList.remove('editing');
  }
  function revert() { input.value = lastValue; close(); }
  function refresh() {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      const items = getItems('');
      if (showAllOnFocus || items.length) open(items);
      else close();
      return;
    }
    if (q.length < minChars) { close(); return; }
    open(getItems(q));
  }

  input.addEventListener('focus', () => { lastValue = input.value; input.value = ''; refresh(); });
  input.addEventListener('input', refresh);
  input.addEventListener('blur', () => setTimeout(() => { if (dropdown.classList.contains('open')) revert(); }, 120));
  input.addEventListener('keydown', (e) => {
    if (!dropdown.classList.contains('open')) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = Math.min(activeIndex + 1, currentItems.length - 1); highlight(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); highlight(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (activeIndex >= 0 && currentItems[activeIndex]) select(currentItems[activeIndex]); }
    else if (e.key === 'Escape') { revert(); input.blur(); }
  });
  function highlight() { [...dropdown.children].forEach((el, i) => el.classList.toggle('active', i === activeIndex)); }
  function select(item) {
    if (item && item.__clear) { lastValue = ''; input.value = ''; close(); if (onClear) onClear(); return; }
    lastValue = displayValue(item); input.value = lastValue; close(); onSelect(item);
  }

  dropdown.addEventListener('mousedown', (e) => {
    const el = e.target.closest('.dropdown-item');
    if (!el) return;
    select(currentItems[parseInt(el.dataset.idx, 10)]);
  });

  return { setValue: (v) => { input.value = v; lastValue = v; } };
}

function clearItemHTML(label, i) {
  return `<div class="dropdown-item dropdown-item-clear" data-idx="${i}"><span>${esc(label)}</span></div>`;
}

function jobItemHTML(job, i) {
  return `<div class="dropdown-item" data-idx="${i}"><span class="dropdown-item-main"><span class="dropdown-item-num">${i + 1}.</span>${esc(job.name)}</span></div>`;
}
function cityItemHTML(city, i) {
  return `<div class="dropdown-item" data-idx="${i}"><span>${esc(city.city)}</span><span class="dropdown-item-sub">${esc(state.stateAbbrev[city.state] || city.state)}</span></div>`;
}
function stateItemHTML(name, i) {
  return `<div class="dropdown-item" data-idx="${i}"><span>${esc(name)}</span><span class="dropdown-item-sub">${esc(state.stateAbbrev[name] || '')}</span></div>`;
}
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

let jobTA, stateTA1, stateTA2, stateTA3, cityTA1, cityTA2, cityTA3;

function initTypeaheads() {
  jobTA = setupTypeahead({
    inputId: 'jobInput', dropdownId: 'jobDropdown', showAllOnFocus: true, minChars: 0,
    getItems: (q) => state.jobs
      .filter(j => j.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const aSal = jobHasSalary(a.rank) ? 0 : 1;
        const bSal = jobHasSalary(b.rank) ? 0 : 1;
        if (aSal !== bSal) return aSal - bSal;
        return a.rank - b.rank;
      }),
    renderItem: jobItemHTML, displayValue: (j) => j.name,
    onSelect: (j) => { state.selectedJobRank = j.rank; renderAll(); },
  });

  const withClearRender = (fn) => (item, i) => item.__clear ? clearItemHTML(item.label, i) : fn(item, i);

  // two state inputs (top filter pill + widget-local), kept in sync
  const stateGetItems = (q) => {
    const base = Object.keys(state.stateAbbrev).filter(s => s.toLowerCase().includes(q)).sort();
    if (!q && state.selectedState) return [{ __clear: true, label: 'Any state' }, ...base];
    return base;
  };
  const onStateSelect = (s) => {
    state.selectedState = s;
    if (state.selectedCity && state.selectedCity.state !== s) { state.selectedCity = null; syncCityInputs(''); }
    syncStateInputs(s);
    renderAll();
  };
  const onStateClear = () => { state.selectedState = null; syncStateInputs(''); renderAll(); };
  stateTA1 = setupTypeahead({ inputId: 'stateInput', dropdownId: 'stateDropdown', showAllOnFocus: true, minChars: 0, getItems: stateGetItems, renderItem: withClearRender(stateItemHTML), displayValue: s => s, onSelect: onStateSelect, onClear: onStateClear });
  stateTA2 = setupTypeahead({ inputId: 'stateInput2', dropdownId: 'stateDropdown2', showAllOnFocus: true, minChars: 0, getItems: stateGetItems, renderItem: withClearRender(stateItemHTML), displayValue: s => s, onSelect: onStateSelect, onClear: onStateClear });
  stateTA3 = setupTypeahead({ inputId: 'stateInput3', dropdownId: 'stateDropdown3', showAllOnFocus: true, minChars: 0, getItems: stateGetItems, renderItem: withClearRender(stateItemHTML), displayValue: s => s, onSelect: onStateSelect, onClear: onStateClear });

  // three city inputs (top filter pill + two widget-locals), kept in sync
  const cityGetItems = (q) => {
    if (!q) return state.selectedCity ? [{ __clear: true, label: 'Any city' }] : [];
    let pool = state.cities;
    if (state.selectedState) pool = pool.filter(c => c.state === state.selectedState);
    return pool.filter(c => c.city.toLowerCase().includes(q)).slice(0, 50);
  };
  const onCitySelect = (c) => { state.selectedCity = c; syncCityInputs(c.city); renderAll(); };
  const onCityClear = () => { state.selectedCity = null; renderAll(); };
  cityTA1 = setupTypeahead({ inputId: 'cityInput', dropdownId: 'cityDropdown', showAllOnFocus: false, minChars: 3, getItems: cityGetItems, renderItem: withClearRender(cityItemHTML), displayValue: c => c.city, onSelect: onCitySelect, onClear: onCityClear });
  cityTA2 = setupTypeahead({ inputId: 'cityInput2', dropdownId: 'cityDropdown2', showAllOnFocus: false, minChars: 3, getItems: cityGetItems, renderItem: withClearRender(cityItemHTML), displayValue: c => c.city, onSelect: onCitySelect, onClear: onCityClear });
  cityTA3 = setupTypeahead({ inputId: 'cityInput3', dropdownId: 'cityDropdown3', showAllOnFocus: false, minChars: 3, getItems: cityGetItems, renderItem: withClearRender(cityItemHTML), displayValue: c => c.city, onSelect: onCitySelect, onClear: onCityClear });
}

function syncStateInputs(v) { document.getElementById('stateInput').value = v; document.getElementById('stateInput2').value = v; document.getElementById('stateInput3').value = v; }
function syncCityInputs(v) { document.getElementById('cityInput').value = v; document.getElementById('cityInput2').value = v; document.getElementById('cityInput3').value = v; }
function syncJobInput() { const job = state.jobs.find(j => j.rank === state.selectedJobRank); document.getElementById('jobInput').value = job ? job.name : ''; }

// ---------------------------------------------------------------
// Derived data + rendering
// ---------------------------------------------------------------
function resultsForSelectedJob() { return state.results.filter(r => r.jobRank === state.selectedJobRank); }

function jobHasSalary(rank) {
  if (!state.hasSalaryData) return false;
  return state.results.some(r => r.jobRank === rank && r.avgSalary !== null && !isNaN(r.avgSalary));
}
function applyLocationFilters(rows) {
  let out = rows;
  if (state.selectedState) out = out.filter(r => r.state === state.selectedState);
  if (state.selectedCity) out = out.filter(r => r.city.toLowerCase() === state.selectedCity.city.toLowerCase());
  return out;
}

function renderAll() {
  const job = state.jobs.find(j => j.rank === state.selectedJobRank);
  document.getElementById('pageHeading').textContent = job
    ? `Hi Anna, here's Job Market Outlook for ${job.name} right now.`
    : `Hi Anna, here's Job Market Outlook right now.`;
  document.getElementById('demandSub').textContent = job ? `Top cities for ${job.name}` : 'Top cities for the selected job';
  document.getElementById('salarySub').textContent = job ? `For ${job.name}` : 'Median salary estimate';

  renderStats();
  renderDemand();
  renderSalaryWidget();
}

function renderSalaryWidget() {
  const emptyEl = document.getElementById('salaryEmpty');
  const listEl = document.getElementById('salaryList');

  if (!state.hasSalaryData) {
    emptyEl.style.display = '';
    listEl.style.display = 'none';
    return;
  }

  const jobRows = resultsForSelectedJob();
  const filtered = applyLocationFilters(jobRows)
    .filter(r => r.avgSalary !== null && !isNaN(r.avgSalary))
    .sort((a, b) => b.avgSalary - a.avgSalary)
    .slice(0, 20);

  if (!filtered.length) {
    emptyEl.style.display = '';
    emptyEl.textContent = 'No salary data for this job in the current filters (JobSpikr needs a minimum sample size per city to compute salary).';
    listEl.style.display = 'none';
    return;
  }

  emptyEl.style.display = 'none';
  listEl.style.display = '';

  const max = filtered[0].avgSalary;
  listEl.innerHTML = filtered.map(r => `
    <div class="demand-row">
      <div class="demand-row-top">
        <div class="demand-place">
          <span class="demand-city">${esc(r.city)}</span>
          <span class="demand-state">${esc(r.state)}</span>
        </div>
        <span class="demand-count mono">$${Math.round(r.avgSalary).toLocaleString()}</span>
      </div>
      <div class="demand-bar-track"><div class="demand-bar-fill" style="width:${Math.max(4, (r.avgSalary / max) * 100)}%"></div></div>
    </div>
  `).join('');
}

function renderStats() {
  const jobRows = resultsForSelectedJob();
  const filtered = applyLocationFilters(jobRows);
  const total = filtered.reduce((s, r) => s + r.count, 0);

  document.getElementById('statTotal').textContent = state.results.length ? total.toLocaleString() : '\u2014';
  renderSalaryStat(filtered);
}

function renderSalaryStat(filtered) {
  const card = document.getElementById('salaryCard');
  const valueEl = document.getElementById('statSalary');

  if (!state.hasSalaryData) {
    card.classList.add('unavailable');
    valueEl.classList.remove('mono');
    valueEl.classList.add('stat-na');
    valueEl.textContent = 'Not captured in this pass';
    return;
  }

  const salaries = filtered.map(r => r.avgSalary).filter(v => v !== null && !isNaN(v));
  card.classList.remove('unavailable');
  valueEl.classList.remove('stat-na');
  valueEl.classList.add('mono');

  if (!salaries.length) {
    valueEl.textContent = '\u2014';
    return;
  }
  const sorted = [...salaries].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  valueEl.textContent = `$${Math.round(median).toLocaleString()}`;
}

function renderDemand() {
  const jobRows = resultsForSelectedJob();
  const filtered = applyLocationFilters(jobRows).filter(r => r.count > 0).sort((a, b) => b.count - a.count).slice(0, 20);
  const container = document.getElementById('demandList');
  const job = state.jobs.find(j => j.rank === state.selectedJobRank);

  if (!state.results.length) {
    container.innerHTML = '<div class="demand-empty">No results file loaded yet. Drop your JobSpikr pull into data/results.csv and refresh.</div>';
    return;
  }
  if (!filtered.length) {
    container.innerHTML = `<div class="demand-empty">No postings found for ${job ? esc(job.name) : 'this job'} in the current filters.</div>`;
    return;
  }

  const max = filtered[0].count;
  container.innerHTML = filtered.map(r => `
    <div class="demand-row">
      <div class="demand-row-top">
        <div class="demand-place">
          <span class="demand-city">${esc(r.city)}</span>
          <span class="demand-state">${esc(r.state)}</span>
        </div>
        <span class="demand-count mono">${r.count.toLocaleString()}</span>
      </div>
      <div class="demand-bar-track"><div class="demand-bar-fill" style="width:${Math.max(4, (r.count / max) * 100)}%"></div></div>
    </div>
  `).join('');
}

initTypeaheads();
loadData();
