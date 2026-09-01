const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function fmtSalary(min, max) {
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  if (!min && !max) return '';
  if (min && max) return `$${fmt(min)}–$${fmt(max)} a year`;
  return `$${fmt(min || max)} a year`;
}

const CATEGORY_INFO = {
  animal: { emoji: '🐾', label: 'Animal care' },
  government: { emoji: '🏛️', label: 'Community' },
  warehouse: { emoji: '📦', label: 'Warehouse' },
  retail: { emoji: '🛍️', label: 'Retail' },
  general: { emoji: '💼', label: 'General' },
};

let resumeCategoryById = {};

function categoryFor(job) {
  const fromResume = resumeCategoryById[job.suggested_resume_id];
  if (fromResume) return fromResume;
  const flags = JSON.parse(job.flags || '[]');
  return flags.includes('animal_or_kids_focus') ? 'animal' : 'general';
}

// Rated on how well a job fits: animals/kids focus, simple/routine tasks,
// and no cash handling (jobs that need cash handling never make it here).
function ratingFor(score) {
  if (score >= 10) return { tier: 'great', stars: '🌟🌟🌟', label: 'Great match' };
  if (score >= 5) return { tier: 'good', stars: '🌟🌟', label: 'Good match' };
  return { tier: 'ok', stars: '🌟', label: 'OK match' };
}

function friendlyBadges(flags) {
  const badges = [];
  if (flags.includes('animal_or_kids_focus')) badges.push({ cls: 'good', text: '🐾 Animals or kids' });
  if (flags.includes('simple_task_role')) badges.push({ cls: 'good', text: '✅ Simple tasks' });
  if (flags.some((f) => f.startsWith('caution:'))) badges.push({ cls: 'note', text: '👀 Worth a closer look' });
  return badges;
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
let jobsAll = [];
const CATEGORY_ORDER = ['animal', 'government', 'warehouse', 'retail', 'general'];

// Sorting purely by score lets whichever category has the most postings
// (usually animal care) flood the top of the list. This keeps quality
// (each group is still score-sorted) but mixes categories so a good variety
// shows up without having to touch a filter.
function interleaveByCategory(jobs) {
  const groups = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, []]));
  for (const job of jobs) {
    const cat = categoryFor(job);
    (groups[cat] || groups.general).push(job);
  }
  for (const cat of CATEGORY_ORDER) groups[cat].sort((a, b) => b.score - a.score);

  const mixed = [];
  let added = true;
  while (added) {
    added = false;
    for (const cat of CATEGORY_ORDER) {
      if (groups[cat].length) {
        mixed.push(groups[cat].shift());
        added = true;
      }
    }
  }
  return mixed;
}

function renderJobs() {
  const catFilter = $('#filter-category').value;
  const ratingFilter = $('#filter-rating').value;
  const sort = $('#filter-sort').value;

  let jobs = jobsAll.slice();

  if (catFilter !== 'all') {
    jobs = jobs.filter((j) => categoryFor(j) === catFilter);
  }
  if (ratingFilter === 'great') {
    jobs = jobs.filter((j) => ratingFor(j.score).tier === 'great');
  } else if (ratingFilter === 'good') {
    jobs = jobs.filter((j) => ratingFor(j.score).tier !== 'ok');
  }

  if (sort === 'pay') {
    jobs.sort((a, b) => (b.salary_max || b.salary_min || 0) - (a.salary_max || a.salary_min || 0));
  } else if (sort === 'new') {
    jobs.sort((a, b) => new Date(b.fetched_at) - new Date(a.fetched_at));
  } else {
    jobs = interleaveByCategory(jobs);
  }

  const list = $('#jobs-list');
  list.innerHTML = '';
  if (jobs.length === 0) {
    list.innerHTML = '<div class="empty-hint">No jobs match these filters yet.<br>Try "✨ Find new jobs" or loosen a filter!</div>';
    return;
  }
  for (const job of jobs) {
    const flags = JSON.parse(job.flags || '[]');
    const rating = ratingFor(job.score);
    const cat = CATEGORY_INFO[categoryFor(job)] || CATEGORY_INFO.general;
    const badges = friendlyBadges(flags);
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-top">
        <span class="card-emoji">${cat.emoji}</span>
        <div>
          <h3>${job.title}</h3>
          <div class="meta">${job.company || 'Employer'} ${job.location ? '· ' + job.location : ''}</div>
          <div class="meta">${rating.stars} ${rating.label}${job.salary_min ? ' · ' + fmtSalary(job.salary_min, job.salary_max) : ''}</div>
        </div>
      </div>
      <div class="badges">${badges.map((b) => `<span class="badge ${b.cls}">${b.text}</span>`).join('')}</div>
      <div class="card-actions">
        <a class="link-btn" href="${job.url}" target="_blank" rel="noopener">👀 See the job</a>
        <button class="btn-primary" data-save="${job.id}">💌 I like this one!</button>
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
      jobsAll = jobsAll.filter((j) => j.id !== Number(btn.dataset.save));
      renderJobs();
      await loadApplications();
    });
  });
}

async function loadJobs() {
  jobsAll = await api('/jobs');
  renderJobs();
}

['filter-category', 'filter-rating', 'filter-sort'].forEach((id) => {
  $(`#${id}`).addEventListener('change', renderJobs);
});

$('#refresh-btn').addEventListener('click', async () => {
  const status = $('#refresh-status');
  status.textContent = 'Looking for jobs…';
  try {
    const result = await api('/jobs/refresh', { method: 'POST' });
    status.textContent = `Found ${result.matched} jobs worth a look!`;
    await loadJobs();
  } catch (err) {
    status.textContent = "Couldn't search right now — try again in a bit.";
  }
});

// ---- Applications ----
const STATUSES = ['draft', 'approved', 'applied', 'interview', 'offer', 'rejected'];
const STATUS_INFO = {
  draft: { emoji: '📝', label: 'Needs a look' },
  approved: { emoji: '👍', label: 'Ready to send' },
  applied: { emoji: '📨', label: 'Applied!' },
  interview: { emoji: '🎤', label: 'Interview' },
  offer: { emoji: '🎉', label: 'Offer!' },
  rejected: { emoji: '💛', label: 'Not this time' },
};

async function loadApplications() {
  const apps = await api('/applications');
  const list = $('#applications-list');
  list.innerHTML = '';
  if (apps.length === 0) {
    list.innerHTML = '<div class="empty-hint">Nothing picked yet.<br>Go find some jobs you like!</div>';
    return;
  }
  for (const app of apps) {
    const info = STATUS_INFO[app.status] || STATUS_INFO.draft;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <span class="status-pill" data-status="${app.status}">${info.emoji} ${info.label}</span>
      <h3>${app.title}</h3>
      <div class="meta">${app.company || ''}${app.resume_label ? ' · 📄 ' + app.resume_label : ''}</div>
      <label>Message to send with your application
        <textarea data-notes="${app.id}" rows="5">${app.notes || ''}</textarea>
      </label>
      <div class="card-actions">
        <select data-status="${app.id}">
          ${STATUSES.map((s) => `<option value="${s}" ${s === app.status ? 'selected' : ''}>${STATUS_INFO[s].emoji} ${STATUS_INFO[s].label}</option>`).join('')}
        </select>
        <button data-save-notes="${app.id}">💾 Save changes</button>
        <a class="link-btn" href="${app.job_url}" target="_blank" rel="noopener">👀 Open job to apply</a>
        <button data-remove="${app.id}">↩️ Take off my list</button>
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
      const pill = sel.closest('.card').querySelector('.status-pill');
      const info = STATUS_INFO[sel.value];
      pill.dataset.status = sel.value;
      pill.textContent = `${info.emoji} ${info.label}`;
    });
  });
  list.querySelectorAll('[data-save-notes]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const textarea = btn.closest('.card').querySelector('[data-notes]');
      await api(`/applications/${btn.dataset.saveNotes}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ notes: textarea.value }),
      });
      btn.textContent = '✅ Saved!';
      setTimeout(() => (btn.textContent = '💾 Save changes'), 1200);
    });
  });
  list.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/applications/${btn.dataset.remove}`, { method: 'DELETE' });
      await Promise.all([loadApplications(), loadJobs()]);
    });
  });
}

// ---- Preferences ----
let profileCache = null;

function csvToArray(str) {
  return str
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function arrayToCsv(arr) {
  return (arr || []).join(', ');
}

function fillPrefsForm(profile) {
  $('#pref-location').value = profile.location || '';
  const radSel = $('#pref-radius');
  const radius = String(profile.radius_miles || 15);
  const opt = [...radSel.options].find((o) => o.value === radius);
  if (opt) opt.selected = true;
  $('#pref-exclude').value = arrayToCsv(profile.exclude_keywords);
  $('#pref-boost').value = arrayToCsv(profile.boost_keywords);
  $('#pref-caution').value = arrayToCsv(profile.caution_keywords);
}

$('#prefs-toggle').addEventListener('click', async () => {
  const panel = $('#prefs-panel');
  const btn = $('#prefs-toggle');
  const opening = panel.hidden;
  panel.hidden = !opening;
  btn.classList.toggle('open', opening);
  if (opening && !profileCache) {
    try {
      profileCache = await api('/profile');
      fillPrefsForm(profileCache);
    } catch {
      $('#prefs-status').textContent = "Couldn't load preferences.";
    }
  }
});

$('#prefs-save').addEventListener('click', async () => {
  const status = $('#prefs-status');
  status.textContent = 'Saving…';
  try {
    const updated = {
      ...profileCache,
      location: $('#pref-location').value.trim() || profileCache.location,
      radius_miles: Number($('#pref-radius').value),
      exclude_keywords: csvToArray($('#pref-exclude').value),
      boost_keywords: csvToArray($('#pref-boost').value),
      caution_keywords: csvToArray($('#pref-caution').value),
    };
    profileCache = await api('/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(updated),
    });
    fillPrefsForm(profileCache);
    status.textContent = '✅ Saved! Hit "Find new jobs" to use the new settings.';
    setTimeout(() => (status.textContent = ''), 4000);
  } catch (err) {
    status.textContent = `Couldn't save: ${err.message}`;
  }
});

// ---- Init ----
(async function init() {
  const resumes = await api('/resumes');
  resumeCategoryById = Object.fromEntries(resumes.map((r) => [r.id, r.category]));
  await Promise.all([loadJobs(), loadApplications()]);
})();
