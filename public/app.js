const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function fmtSalary(min, max) {
  if (!min && !max) return '';
  if (min && max) return `$${Math.round(min)}–$${Math.round(max)}/yr`;
  return `$${Math.round(min || max)}/yr`;
}

async function api(path, opts) {
  const res = await fetch(`/api${path}`, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `request failed: ${res.status}`);
  }
  return res.json();
}

// ---- Tabs ----
$$('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    $$('.tab').forEach((t) => t.classList.remove('active'));
    $$('.panel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    $(`#${tab.dataset.tab}`).classList.add('active');
  });
});

// ---- Jobs ----
let resumesCache = [];

async function loadJobs() {
  const jobs = await api('/jobs');
  const list = $('#jobs-list');
  list.innerHTML = '';
  if (jobs.length === 0) {
    list.innerHTML = '<p>No matches yet. Click "Refresh job search" to pull current openings.</p>';
    return;
  }
  for (const job of jobs) {
    const flags = JSON.parse(job.flags || '[]');
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h3>${job.title}</h3>
      <div class="meta">${job.company || 'Unknown employer'} · ${job.location || ''} · score ${job.score} · ${fmtSalary(job.salary_min, job.salary_max)}</div>
      <div class="flags">${flags.map((f) => `<span class="flag ${f.startsWith('animal') || f.startsWith('simple') ? 'boost' : ''}">${f}</span>`).join('')}</div>
      <div class="card-actions">
        <a href="${job.url}" target="_blank" rel="noopener">View posting</a>
        <button data-save="${job.id}">Save to applications</button>
      </div>
    `;
    list.appendChild(card);
  }
  list.querySelectorAll('[data-save]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api('/applications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ job_id: Number(btn.dataset.save) }),
      });
      btn.textContent = 'Saved!';
      btn.disabled = true;
    });
  });
}

$('#refresh-btn').addEventListener('click', async () => {
  const status = $('#refresh-status');
  status.textContent = 'Searching…';
  try {
    const result = await api('/jobs/refresh', { method: 'POST' });
    status.textContent = `Found ${result.fetched}, ${result.matched} matched, ${result.excluded} filtered out.`;
    await loadJobs();
  } catch (err) {
    status.textContent = err.message;
  }
});

// ---- Applications ----
const STATUSES = ['saved', 'ready', 'applied', 'interview', 'offer', 'rejected'];

async function loadApplications() {
  const apps = await api('/applications');
  const list = $('#applications-list');
  list.innerHTML = '';
  if (apps.length === 0) {
    list.innerHTML = '<p>Nothing saved yet — save jobs from the Job Matches tab.</p>';
    return;
  }
  for (const app of apps) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h3>${app.title}</h3>
      <div class="meta">${app.company || ''}</div>
      <div class="card-actions">
        <select data-status="${app.id}">
          ${STATUSES.map((s) => `<option value="${s}" ${s === app.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <select data-resume="${app.id}">
          <option value="">No resume picked</option>
          ${resumesCache.map((r) => `<option value="${r.id}" ${r.id === app.resume_id ? 'selected' : ''}>${r.label}</option>`).join('')}
        </select>
        <a href="${app.job_url}" target="_blank" rel="noopener">Open posting to apply</a>
      </div>
    `;
    list.appendChild(card);
  }
  list.querySelectorAll('[data-status]').forEach((sel) => {
    sel.addEventListener('change', async () => {
      await api(`/applications/${sel.dataset.status}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: sel.value }),
      });
    });
  });
  list.querySelectorAll('[data-resume]').forEach((sel) => {
    sel.addEventListener('change', async () => {
      await api(`/applications/${sel.dataset.resume}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resume_id: sel.value ? Number(sel.value) : null }),
      });
    });
  });
}

// ---- Resumes ----
async function loadResumes() {
  const resumes = await api('/resumes');
  resumesCache = resumes;
  const list = $('#resumes-list');
  list.innerHTML = '';
  for (const r of resumes) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h3>${r.label}</h3>
      <div class="meta">${r.category} · ${r.filename}</div>
      <div class="card-actions">
        <a href="/api/resumes/${r.id}/download">Download</a>
        <button data-delete="${r.id}">Delete</button>
      </div>
    `;
    list.appendChild(card);
  }
  list.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/resumes/${btn.dataset.delete}`, { method: 'DELETE' });
      await loadResumes();
    });
  });
}

$('#resume-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  await fetch('/api/resumes', { method: 'POST', body: form });
  e.target.reset();
  await loadResumes();
});

// ---- Profile ----
async function loadProfile() {
  const profile = await api('/profile');
  const form = $('#profile-form');
  form.name.value = profile.name;
  form.location.value = profile.location;
  form.radius_miles.value = profile.radius_miles;
  form.exclude_keywords.value = profile.exclude_keywords.join(', ');
  form.cash_handling_keywords.value = profile.cash_handling_keywords.join(', ');
  form.boost_keywords.value = profile.boost_keywords.join(', ');
  form.simple_task_keywords.value = profile.simple_task_keywords.join(', ');
  form.caution_keywords.value = profile.caution_keywords.join(', ');
  form.notes.value = profile.notes || '';
}

$('#profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const toList = (key) =>
    String(form.get(key) || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  await api('/profile', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: form.get('name'),
      location: form.get('location'),
      radius_miles: Number(form.get('radius_miles')),
      exclude_keywords: toList('exclude_keywords'),
      cash_handling_keywords: toList('cash_handling_keywords'),
      boost_keywords: toList('boost_keywords'),
      simple_task_keywords: toList('simple_task_keywords'),
      caution_keywords: toList('caution_keywords'),
      notes: form.get('notes'),
    }),
  });
  alert('Preferences saved.');
});

// ---- Init ----
(async function init() {
  await loadResumes();
  await Promise.all([loadJobs(), loadApplications(), loadProfile()]);
})();
