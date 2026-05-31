// Kallpa Dashboard — app.js
// Bento Grid design with program builder

let sbClient = null, currentUser = null, profileData = {}, settingsData = {};

// ── Cache Layer ───────────────────────────────────────────────
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CACHE_PREFIX = 'kallpa_dash_';

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    return { data, ts, fresh: (Date.now() - ts) < CACHE_TTL };
  } catch { return null; }
}

function cacheSet(key, data) {
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, ts: Date.now() })); } catch {}
}

function cacheInvalidate(...keys) {
  keys.forEach(k => { try { localStorage.removeItem(CACHE_PREFIX + k); } catch {} });
}

function cacheClearAll() {
  try {
    Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX)).forEach(k => localStorage.removeItem(k));
  } catch {}
  clearE1rmCaches();
}

// ── Init ──────────────────────────────────────────────────────
function resolveSupabaseConfig() {
  const dash = window.DASHBOARD_CONFIG;
  if (dash?.supabaseUrl && dash?.supabaseAnonKey) return dash;
  const k = window.KALLPA_CONFIG;
  if (k?.SUPABASE_URL && k?.SUPABASE_ANON_KEY) {
    return {
      supabaseUrl: String(k.SUPABASE_URL).replace(/\/$/, ''),
      supabaseAnonKey: k.SUPABASE_ANON_KEY,
    };
  }
  return null;
}

async function init() {
  if (location.protocol === 'file:') {
    const err = document.getElementById('login-error');
    if (err) {
      err.textContent = 'Do not open this file directly. Double-click Open-Dashboard.bat in the web folder, or go to https://kallpa.co/dashboard/';
      err.classList.remove('hidden');
    }
    return;
  }
  const cfg = resolveSupabaseConfig();
  if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey) {
    const err = document.getElementById('login-error');
    if (err) {
      err.textContent = 'Supabase not configured — copy config.js or dashboard-config.js with your project keys.';
      err.classList.remove('hidden');
    }
    console.warn('No Supabase config found');
    return;
  }
  try {
    sbClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  } catch (e) {
    console.error('Failed to create Supabase client:', e);
    return;
  }
  const { data: { session } } = await sbClient.auth.getSession();
  if (session) { currentUser = session.user; showApp(); }
  sbClient.auth.onAuthStateChange((ev, s) => {
    if (ev === 'SIGNED_IN' && s) { currentUser = s.user; showApp(); }
    else if (ev === 'SIGNED_OUT') { currentUser = null; showLogin(); }
  });
}

// ── Auth ──────────────────────────────────────────────────────
async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pw = document.getElementById('login-password').value;
  const err = document.getElementById('login-error');
  if (!sbClient) { err.textContent = 'Not configured — see dashboard-config.example.js'; err.classList.remove('hidden'); return; }
  if (!email || !pw) { err.textContent = 'Enter email and password'; err.classList.remove('hidden'); return; }
  document.getElementById('login-btn').disabled = true;
  err.classList.add('hidden');
  const { error } = await sbClient.auth.signInWithPassword({ email, password: pw });
  if (error) { err.textContent = error.message; err.classList.remove('hidden'); }
  document.getElementById('login-btn').disabled = false;
}
async function handleGoogleLogin() {
  if (!sbClient) return;
  await sbClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' } } });
}
async function handleLogout() { cacheClearAll(); await sbClient.auth.signOut(); showLogin(); }
function showLogin() { document.getElementById('login-overlay').classList.remove('hidden'); document.getElementById('app-layout').classList.add('hidden'); }
function showApp() { document.getElementById('login-overlay').classList.add('hidden'); document.getElementById('app-layout').classList.remove('hidden'); loadAll(); }

// ── Navigation ────────────────────────────────────────────────
function showPage(page) {
  document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelectorAll('.sidebar-link').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  document.querySelectorAll('.lg\\:hidden .chip').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  // Force refresh when switching to Programs (ensures fresh data after app changes)
  if (page === 'program') {
    // Reset to list view (in case builder was open)
    document.getElementById('program-list-view').classList.remove('hidden');
    document.getElementById('program-builder').classList.add('hidden');
    cacheInvalidate('dashboard_' + (currentUser?.id || ''));
    loadAll(true);
  }
}

// ── Load All Data ─────────────────────────────────────────────
async function loadAll(forceRefresh = false) {
  if (!currentUser) return;
  const uid = currentUser.id;

  // Try cache first — render immediately if available
  if (!forceRefresh) {
    const cached = cacheGet('dashboard_' + uid);
    if (cached && cached.data) {
      renderFromData(cached.data);
      // If cache is fresh, skip network entirely
      if (cached.fresh) return;
    }
  }

  // Fetch from Supabase
  _cycleContextCache = null;
  const [userRes, whRes, prRes, bwRes, progRes, prefRes] = await Promise.all([
    sbClient.from('users').select('*').eq('id', uid).single(),
    sbClient.from('v_workout_history').select('*').eq('user_id', uid).order('completed_at', { ascending: false }).limit(50),
    sbClient.from('v_personal_records').select('*, exercises(name_en, name_es)').eq('user_id', uid).order('last_pr_date', { ascending: false }),
    sbClient.from('bodyweight_log').select('weight_kg, logged_at').eq('user_id', uid).order('logged_at', { ascending: false }).limit(30),
    sbClient.from('programs').select('*').eq('user_id', uid).eq('is_template', false).order('created_at', { ascending: false }),
    sbClient.from('user_exercise_preferences').select('exercise_id, is_tracked, is_pinned, sort_order').eq('user_id', uid),
  ]);

  [userRes, whRes, prRes, bwRes, progRes, prefRes].forEach((res, i) => {
    if (res.error) console.error('Dashboard load failed:', ['users', 'workouts', 'prs', 'bodyweight', 'programs', 'prefs'][i], res.error);
  });

  const freshData = {
    user: userRes.data,
    workouts: whRes.data || [],
    allPrs: prRes.data || [],
    bw: bwRes.data || [],
    programs: (progRes.data || []).filter(p => p.deleted_at == null),
    prefs: prefRes.data || [],
  };

  // Cache the fresh data
  cacheSet('dashboard_' + uid, freshData);

  renderFromData(freshData);
}

function renderFromData(d) {
  _cycleContextCache = null;
  const { user, workouts, allPrs, bw, programs, prefs } = d;
  profileData = user || {};

  // Merge preferences into PRs (same as app: pinned first, then tracked, then by last_pr_date)
  const prefMap = {};
  prefs.forEach(p => { prefMap[p.exercise_id] = p; });
  const prs = allPrs.map(pr => ({ ...pr, isTracked: prefMap[pr.exercise_id]?.is_tracked || false, isPinned: prefMap[pr.exercise_id]?.is_pinned || false }));
  // Sort: pinned first, then tracked, then by last_pr_date
  prs.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    if (a.isTracked !== b.isTracked) return a.isTracked ? -1 : 1;
    return new Date(b.last_pr_date || 0) - new Date(a.last_pr_date || 0);
  });

  // Determine active program (same logic as app: users.active_program_id → fallback to most recent)
  let activeProgram = null;
  const activeId = user?.active_program_id;
  if (activeId) activeProgram = programs.find(p => p.id === activeId);
  if (!activeProgram && programs.length > 0) activeProgram = programs[0];

  // Populate all sections
  renderOverview(user, workouts, prs, bw, programs, activeProgram);
  renderProgramList(programs, activeProgram);
  populateProfile(user);
  populateSettings(user);
}

// ── Overview ──────────────────────────────────────────────────
function renderOverview(user, workouts, prs, bw, programs, activeProgram) {
  const name = user?.display_name || currentUser.email?.split('@')[0] || 'Lifter';
  document.getElementById('ov-name').textContent = name;
  document.getElementById('nav-user-name').textContent = name;
  const h = new Date().getHours();
  document.getElementById('ov-greeting').textContent = h < 12 ? 'Good morning,' : h < 17 ? 'Good afternoon,' : 'Good evening,';

  // Streak + sessions this week
  const planned = user?.days_per_week || 4;
  const weekStart = getWeekStart(new Date());
  // Count sessions this week using date filter (same as app: distinct completed dates in Mon-Sun window)
  const weekW = workouts.filter(w => new Date(w.completed_at) >= weekStart);
  const sessionsThisWeek = weekW.length;

  // Streak: count consecutive ISO weeks meeting target
  const weekMap = {};
  workouts.forEach(w => { const d = (w.completed_at || w.date).substring(0, 10); const wk = isoWeek(new Date(d)); if (!weekMap[wk]) weekMap[wk] = new Set(); weekMap[wk].add(d); });
  const thisWk = isoWeek(new Date());
  let streak = 0;
  const sorted = Object.keys(weekMap).sort().reverse();
  for (const wk of sorted) { if (weekMap[wk].size >= planned) streak++; else if (wk !== thisWk) break; }
  document.getElementById('ov-streak').textContent = streak;
  document.getElementById('ov-streak-best').textContent = streak > 0 ? `Best: ${streak}w` : '';

  // Week bars
  const bars = Array.from({ length: planned }, (_, i) => `<div class="w-8 h-1.5 rounded-full ${i < sessionsThisWeek ? 'bg-violet' : 'bg-surface-2'}"></div>`).join('');
  document.getElementById('ov-week-bars').innerHTML = bars;
  document.getElementById('ov-context').textContent = `${sessionsThisWeek}/${planned} sessions this week`;

  // Stats
  document.getElementById('ov-workouts').textContent = workouts.length;
  document.getElementById('ov-sets-week').textContent = weekW.reduce((s, w) => s + (w.working_set_count || 0), 0);
  const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30);
  const recentPRs = prs.filter(p => p.last_pr_date && new Date(p.last_pr_date) > monthAgo);
  document.getElementById('ov-prs').textContent = recentPRs.length;
  const unit = user?.weight_unit || 'kg'; const conv = unit === 'lb' ? 2.20462 : 1;
  if (bw.length > 0) document.getElementById('ov-bw').textContent = (bw[0].weight_kg * conv).toFixed(1) + ' ' + unit;

  // Program card
  const prog = activeProgram;
  if (prog) {
    document.getElementById('ov-prog-name').textContent = prog.name;
    const mesoLen = prog.mesocycle_length_weeks || 6;
    const provisionalStart = pickEarliestDate(
      validCycleStartDate(programCycleStartDate(prog)),
      parseCycleStartFromProgramName(prog.name),
    );
    if (provisionalStart) {
      applyProgramWeekUI(mesoLen, computeMesocycleProgress(provisionalStart, mesoLen).displayWeek);
    } else {
      document.getElementById('ov-prog-week').textContent = `Week …/${mesoLen}`;
    }
    updateActiveProgramWeek(prog);
    loadProgramDays(prog.id, 'ov-prog-days');
  }

  // Volume (from sets data — simplified: count per exercise from recent workouts)
  renderOverviewVolume(workouts);

  // PRs
  renderPRList(prs, 'ov-prs-list', unit, conv);

  // Recent workouts
  renderWorkoutList(workouts, 'ov-workouts-list');

  // 12-week consistency heatmap
  const heatCounts = new Array(12).fill(0);
  workouts.forEach(w => { const wa = Math.floor((Date.now() - new Date(w.completed_at).getTime()) / 604800000); if (wa >= 0 && wa < 12) heatCounts[11 - wa]++; });
  const hMax = Math.max(...heatCounts, 1);
  const heatEl = document.getElementById('ov-heatmap');
  if (heatEl) heatEl.innerHTML = heatCounts.map(c => { const i = c / hMax; let bg = '#1C1C21'; if (i > 0.75) bg = '#A855F7'; else if (i > 0.5) bg = 'rgba(168,85,247,0.6)'; else if (i > 0.25) bg = 'rgba(168,85,247,0.35)'; else if (i > 0) bg = 'rgba(168,85,247,0.15)'; return `<div class="h-7 rounded flex items-center justify-center text-[9px] font-medium" style="background:${bg};color:${c ? '#fff' : '#6B7280'}">${c || ''}</div>`; }).join('');
}

async function loadProgramDays(programId, containerId) {
  const { data: days } = await sbClient.from('program_days').select('id, day_number, label, muscle_focus').eq('program_id', programId).order('day_number');
  if (!days || days.length === 0) { document.getElementById(containerId).innerHTML = '<p class="text-text-secondary text-xs">No days configured</p>'; return; }

  // Count completed sessions this week (same as app home screen)
  const weekStart = getWeekStart(new Date());
  const weekStartStr = weekStart.toISOString().substring(0, 10);
  const { data: weekWorkouts } = await sbClient.from('workouts').select('program_day_id, completed_at, date').eq('user_id', currentUser.id).not('completed_at', 'is', null);

  // Collect program_day_ids that were completed this week
  const doneDayIds = new Set();
  let sessionsThisWeek = 0;
  (weekWorkouts || []).forEach(w => {
    const completedDate = w.completed_at ? w.completed_at.substring(0, 10) : (w.date || '');
    if (completedDate >= weekStartStr) {
      sessionsThisWeek++;
      if (w.program_day_id) doneDayIds.add(w.program_day_id);
    }
  });

  // Mark days as done: first by explicit program_day_id match, then fill sequentially
  // (app marks days done in order when sessions are completed without specific day linking)
  let doneCount = 0;
  document.getElementById(containerId).innerHTML = days.map((d, i) => {
    const doneById = doneDayIds.has(d.id);
    const doneBySequence = i < sessionsThisWeek;
    const done = doneById || doneBySequence;
    if (done) doneCount++;
    const isNext = !done && doneCount === i;
    const border = done ? 'border-success/20 bg-success/5' : isNext ? 'border-violet/30 bg-violet/5' : 'border-border bg-surface-2';
    const status = done ? '<span class="text-[10px] text-success">✓ Done</span>' : isNext ? '<span class="text-[10px] text-violet">→ Next</span>' : '<span class="text-[10px] text-text-disabled">Pending</span>';
    const muscles = (d.muscle_focus || []).join(', ');
    return `<div class="rounded-xl ${border} border p-2.5"><div class="text-[10px] text-text-secondary">Day ${d.day_number}</div><div class="text-xs font-semibold text-white mt-0.5">${d.label || 'Day ' + d.day_number}</div>${muscles ? `<div class="text-[10px] text-text-disabled mt-0.5">${muscles}</div>` : ''}${status}</div>`;
  }).join('');
}

async function renderOverviewVolume(workouts) {
  const weekStart = getWeekStart(new Date());
  const weekIds = workouts.filter(w => new Date(w.completed_at) >= weekStart).map(w => w.id);
  if (weekIds.length === 0) { document.getElementById('ov-volume-bars').innerHTML = '<p class="text-text-secondary text-xs">No data this week</p>'; return; }
  const { data: sets } = await sbClient.from('sets').select('exercises!inner(muscles_primary)').in('workout_id', weekIds).eq('is_warmup', false);
  const counts = {};
  (sets || []).forEach(s => { (s.exercises?.muscles_primary || []).forEach(m => { const k = m === 'lats' || m === 'mid_back' ? 'back' : m; counts[k] = (counts[k] || 0) + 1; }); });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) { document.getElementById('ov-volume-bars').innerHTML = '<p class="text-text-secondary text-xs">No data</p>'; return; }
  const max = sorted[0][1];
  const names = { chest:'Chest', back:'Back', quadriceps:'Quads', hamstrings:'Hams', glutes:'Glutes', lateral_deltoid:'Side Delts', rear_deltoid:'Rear Delts', front_deltoid:'Front Delts', biceps:'Biceps', triceps:'Triceps', calves:'Calves', traps:'Traps', abs:'Abs', forearms:'Forearms', lower_back:'Lower Back', adductors:'Adductors', abductors:'Abductors', obliques:'Obliques', brachialis:'Brachialis', brachioradialis:'Brachioradialis' };
  document.getElementById('ov-volume-bars').innerHTML = sorted.map(([m, c]) => {
    const color = c >= 14 ? '#EAB308' : c >= 8 ? '#22C55E' : '#3B82F6';
    return `<div class="flex items-center gap-2"><span class="text-[10px] text-text-secondary w-16 truncate">${names[m] || m}</span><div class="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden"><div class="h-full rounded-full" style="width:${(c/max)*100}%;background:${color}"></div></div><span class="text-[10px] font-bold text-white w-4 text-right">${c}</span></div>`;
  }).join('');
}

function renderPRList(prs, containerId, unit, conv) {
  allPrsData = prs; // Store for picker
  const tracked = prs.filter(p => p.isTracked);
  const displayPRs = tracked.length > 0 ? tracked : prs;
  // Sort: pinned first, then alphabetically by name
  displayPRs.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    const nameA = (a.exercises?.name_en || '').toLowerCase();
    const nameB = (b.exercises?.name_en || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });

  if (displayPRs.length === 0) {
    document.getElementById(containerId).innerHTML = '<p class="text-text-secondary text-xs">No exercises logged yet.</p>';
    return;
  }

  document.getElementById(containerId).innerHTML = displayPRs.map(pr => {
    const name = pr.exercises?.name_en || 'Unknown';
    const sub = prSubtitle(pr, unit, conv);
    const dateStr = pr.last_pr_date ? new Date(pr.last_pr_date).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '';
    const pin = pr.isPinned ? '<span class="text-violet text-[9px] mr-1">📌</span>' : '';
    const pinBtn = `<button class="text-[10px] px-1.5 py-0.5 rounded ${pr.isPinned ? 'bg-violet/15 text-violet' : 'bg-surface text-text-disabled hover:text-violet'}" onclick="event.stopPropagation();togglePin('${pr.exercise_id}',${!pr.isPinned})" title="${pr.isPinned ? 'Unpin' : 'Pin (max 3)'}">${pr.isPinned ? '📌' : '📍'}</button>`;
    const sparkId = 'spark-' + pr.exercise_id.replace(/-/g, '');
    return `<div class="p-2.5 rounded-lg bg-surface-2 cursor-pointer hover:bg-surface-2/80 transition-colors" onclick="showE1rmDetail('${pr.exercise_id}','${name.replace(/'/g, "\\'")}')">
      <div class="flex items-center gap-2">
        <div class="flex-1 min-w-0">
          <div class="text-xs font-semibold text-white truncate">${pin}${name}</div>
          <div class="text-[10px] text-text-secondary mt-0.5">${sub}</div>
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0">
          ${dateStr ? `<span class="text-[9px] text-text-disabled">${dateStr}</span>` : ''}
          ${pinBtn}
        </div>
      </div>
      <div id="${sparkId}" class="mt-1.5 h-8"></div>
    </div>`;
  }).join('');

  // Load sparklines — fetch user workouts once, then load each exercise
  loadAllSparklines(displayPRs, unit, conv);
}

let _userWorkoutsCache = null;
let _cycleContextCache = null;
let e1rmCache = {};

function clearE1rmCaches() {
  _userWorkoutsCache = null;
  _cycleContextCache = null;
  e1rmCache = {};
}

async function getUserWorkouts() {
  if (_userWorkoutsCache) return _userWorkoutsCache;
  const { data } = await sbClient.from('workouts').select('id, date, program_id, program_day_id').eq('user_id', currentUser.id).not('completed_at', 'is', null);
  _userWorkoutsCache = data || [];
  return _userWorkoutsCache;
}

function parseDateOnly(str) {
  if (!str) return null;
  const [y, m, d] = str.substring(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function daysSinceDate(startStr, endStr) {
  const start = parseDateOnly(startStr);
  const end = parseDateOnly(endStr);
  if (!start || !end) return null;
  return Math.floor((end - start) / 86400000);
}

function resolveWorkoutProgramId(w, dayToProgram, activeProgramId, soleProgramId) {
  return w.program_id || (w.program_day_id && dayToProgram[w.program_day_id]) || activeProgramId || soleProgramId || null;
}

async function fetchProgramsForMarkers(uid) {
  const base = () => sbClient.from('programs').select('id, name, mesocycle_length_weeks, start_date, final_week_is_deload').eq('user_id', uid).eq('is_template', false);
  let res = await base();
  if (!res.error) return res.data || [];
  res = await sbClient.from('programs').select('id, name, mesocycle_length_weeks, start_date').eq('user_id', uid).eq('is_template', false);
  if (!res.error) return (res.data || []).map(p => ({ ...p, final_week_is_deload: true }));
  res = await sbClient.from('programs').select('id, name, mesocycle_length_weeks').eq('user_id', uid).eq('is_template', false);
  if (!res.error) return (res.data || []).map(p => ({ ...p, start_date: null, final_week_is_deload: true }));
  console.error('[markers] programs query failed:', res.error?.message);
  return [];
}

function programCycleStartDate(program) {
  const raw = program.start_date || program.cycle_started_at;
  return raw ? String(raw).substring(0, 10) : null;
}

function workoutDateStr(w) {
  const raw = w?.date || w?.completed_at;
  return raw ? String(raw).substring(0, 10) : null;
}

function pickEarliestDate(...dates) {
  return dates.filter(Boolean).sort()[0] || null;
}

function validCycleStartDate(dateStr) {
  if (!dateStr || !parseDateOnly(dateStr)) return null;
  const today = new Date().toISOString().substring(0, 10);
  return dateStr <= today ? dateStr : null;
}

/** Parse trailing 8 digits from names like "Program Start 06012026" (MMDDYYYY or DDMMYYYY). */
function parseCycleStartFromProgramName(name) {
  if (!name) return null;
  const m = name.match(/(\d{2})(\d{2})(\d{4})\s*$/) || name.match(/Start\s+(\d{2})(\d{2})(\d{4})/i);
  if (!m) return null;
  const a = `${m[3]}-${m[1]}-${m[2]}`; // MMDDYYYY → YYYY-MM-DD
  const b = `${m[3]}-${m[2]}-${m[1]}`; // DDMMYYYY → YYYY-MM-DD
  return validCycleStartDate(pickEarliestDate(validCycleStartDate(a), validCycleStartDate(b)));
}

async function fetchEarliestWorkoutDateForProgram(programId) {
  const uid = currentUser?.id;
  if (!sbClient || !uid) return null;
  const candidates = [];

  const { data: days } = await sbClient.from('program_days').select('id').eq('program_id', programId);
  const dayIds = (days || []).map(d => d.id);
  if (dayIds.length > 0) {
    const { data } = await sbClient.from('workouts')
      .select('date, completed_at')
      .eq('user_id', uid)
      .not('completed_at', 'is', null)
      .in('program_day_id', dayIds)
      .order('date', { ascending: true })
      .limit(1);
    if (data?.[0]) candidates.push(workoutDateStr(data[0]));
  }

  const { data: byProg } = await sbClient.from('workouts')
    .select('date, completed_at')
    .eq('user_id', uid)
    .eq('program_id', programId)
    .not('completed_at', 'is', null)
    .order('date', { ascending: true })
    .limit(1);
  if (byProg?.[0]) candidates.push(workoutDateStr(byProg[0]));

  const activeId = profileData?.active_program_id;
  if (!activeId || activeId === programId) {
    const { data: anyW } = await sbClient.from('workouts')
      .select('date, completed_at')
      .eq('user_id', uid)
      .not('completed_at', 'is', null)
      .order('date', { ascending: true })
      .limit(1);
    if (anyW?.[0]) candidates.push(workoutDateStr(anyW[0]));
  }

  return pickEarliestDate(...candidates.map(validCycleStartDate));
}

function applyProgramWeekUI(mesoLen, displayWeek) {
  document.getElementById('ov-prog-week').textContent = `Week ${displayWeek}/${mesoLen}`;
  document.getElementById('ov-meso-label').textContent = `${displayWeek}/${mesoLen}`;
  document.getElementById('ov-meso-bar').style.width = Math.min(100, (displayWeek / mesoLen) * 100) + '%';
}

/** Matches MesocycleBlockService.compute display week logic. */
function computeMesocycleProgress(startDateStr, mesoLen) {
  const today = new Date().toISOString().substring(0, 10);
  const days = daysSinceDate(startDateStr, today);
  if (days == null || days < 0) return { displayWeek: 1, blockComplete: false };
  const weeksSinceStart = Math.floor(days / 7);
  const blockComplete = weeksSinceStart >= mesoLen;
  const displayWeek = blockComplete ? mesoLen : Math.min(Math.max(weeksSinceStart + 1, 1), mesoLen);
  return { displayWeek, blockComplete };
}

/** Shared cycle-start resolution used by PR markers and the Active Program week badge. */
async function getCycleContext() {
  if (_cycleContextCache) return _cycleContextCache;
  const uid = currentUser.id;
  const activeProgramId = profileData?.active_program_id || null;

  const [programs, { data: workoutsRaw, error: wErr }] = await Promise.all([
    fetchProgramsForMarkers(uid),
    sbClient.from('workouts').select('id, program_id, program_day_id, date, completed_at').eq('user_id', uid).not('completed_at', 'is', null),
  ]);
  if (wErr) console.error('[markers] workouts query failed:', wErr.message);
  const soleProgramId = programs.length === 1 ? programs[0].id : null;
  const dayToProgram = {};
  if (programs.length > 0) {
    const { data: days, error: dayErr } = await sbClient.from('program_days').select('id, program_id').in('program_id', programs.map(p => p.id));
    if (dayErr) console.error('[markers] program_days query failed:', dayErr.message);
    (days || []).forEach(d => { dayToProgram[d.id] = d.program_id; });
  }

  const workouts = (workoutsRaw || []).map(w => ({
    ...w,
    resolvedProgramId: resolveWorkoutProgramId(w, dayToProgram, activeProgramId, soleProgramId),
  }));

  const cycleStarts = {};
  const deloadIds = new Set();
  const cycleStartIds = new Set();
  const cycleEndIds = new Set();

  for (const program of programs) {
    const mesoWeeks = program.mesocycle_length_weeks || 6;

    const programWorkouts = workouts
      .filter(w => w.resolvedProgramId === program.id)
      .sort((a, b) => workoutDateStr(a).localeCompare(workoutDateStr(b)));

    let startDateStr = pickEarliestDate(
      validCycleStartDate(programCycleStartDate(program)),
      validCycleStartDate(programWorkouts.length > 0 ? workoutDateStr(programWorkouts[0]) : null),
      parseCycleStartFromProgramName(program.name),
    );
    if (startDateStr) cycleStarts[program.id] = startDateStr;

    if (mesoWeeks < 2 || !startDateStr) continue;

    const deloadFinalWeek = program.final_week_is_deload !== false;
    for (const w of programWorkouts) {
      const wDate = workoutDateStr(w);
      const days = daysSinceDate(startDateStr, wDate);
      if (days == null || days < 0) continue;
      const weekIndex = Math.floor(days / 7) % mesoWeeks;
      if (weekIndex === 0) cycleStartIds.add(w.id);
      if (weekIndex === mesoWeeks - 1) {
        cycleEndIds.add(w.id);
        if (deloadFinalWeek) deloadIds.add(w.id);
      }
    }
  }

  console.info('[markers]', { programs: programs.length, workouts: workouts.length, cycleStart: cycleStartIds.size, cycleEnd: cycleEndIds.size, deload: deloadIds.size, cycleAnchors: Object.keys(cycleStarts).length });
  _cycleContextCache = { cycleStarts, deloadIds, cycleStartIds, cycleEndIds };
  return _cycleContextCache;
}

async function resolveProgramCycleStart(program) {
  const candidates = [];

  candidates.push(validCycleStartDate(programCycleStartDate(program)));

  if (sbClient && program.id) {
    const { data: fresh } = await sbClient.from('programs').select('start_date, name, created_at').eq('id', program.id).maybeSingle();
    if (fresh) {
      candidates.push(validCycleStartDate(programCycleStartDate(fresh)));
      candidates.push(parseCycleStartFromProgramName(fresh.name || program.name));
    }
  }

  try {
    const ctx = await getCycleContext();
    candidates.push(validCycleStartDate(ctx.cycleStarts[program.id]));
  } catch (e) {
    console.warn('[week] getCycleContext failed:', e);
  }

  candidates.push(await fetchEarliestWorkoutDateForProgram(program.id));
  candidates.push(parseCycleStartFromProgramName(program.name));

  const startStr = pickEarliestDate(...candidates);
  if (startStr) return startStr;

  // Last resort — better than showing "—/6"
  const created = program.created_at ? String(program.created_at).substring(0, 10) : null;
  return validCycleStartDate(created);
}

async function updateActiveProgramWeek(prog) {
  const mesoLen = prog.mesocycle_length_weeks || 6;
  try {
    const startStr = await resolveProgramCycleStart(prog);
    if (!startStr) {
      document.getElementById('ov-prog-week').textContent = `Week —/${mesoLen}`;
      document.getElementById('ov-meso-label').textContent = `—/${mesoLen}`;
      document.getElementById('ov-meso-bar').style.width = '0%';
      return;
    }
    const { displayWeek } = computeMesocycleProgress(startStr, mesoLen);
    console.info('[week]', { programId: prog.id, startStr, displayWeek, mesoLen });
    applyProgramWeekUI(mesoLen, displayWeek);
  } catch (e) {
    console.warn('[week] updateActiveProgramWeek failed:', e);
  }
}

async function getCycleMarkerWorkoutIds() {
  const ctx = await getCycleContext();
  return { deloadIds: ctx.deloadIds, cycleStartIds: ctx.cycleStartIds, cycleEndIds: ctx.cycleEndIds };
}
function trimCycleMarkers(points) {
  if (points.length < 2) return;
  for (let i = 1; i < points.length; i++) {
    if (points[i].isCycleStart && points[i - 1].isCycleStart) points[i].isCycleStart = false;
  }
  for (let i = points.length - 2; i >= 0; i--) {
    if (points[i].isCycleEnd && points[i + 1].isCycleEnd) points[i].isCycleEnd = false;
  }
}

function markerLabels() {
  const es = profileData.locale === 'es';
  return {
    deload: es ? 'Descarga' : 'Deload',
    cycleStart: es ? 'Inicio de ciclo' : 'Cycle start',
    cycleEnd: es ? 'Fin de ciclo' : 'Cycle end',
  };
}

function markerBadgesHtml(p) {
  const labels = markerLabels();
  let html = '';
  if (p.isDeload) html += `<span class="ml-1.5 px-1 py-0.5 rounded text-[9px] font-bold bg-warning/15 text-warning">${labels.deload}</span>`;
  if (p.isCycleStart && !p.isDeload) html += `<span class="ml-1.5 px-1 py-0.5 rounded text-[9px] font-bold bg-success/15 text-success">${labels.cycleStart}</span>`;
  if (p.isCycleEnd) html += `<span class="ml-1.5 px-1 py-0.5 rounded text-[9px] font-bold bg-info/15 text-info">${labels.cycleEnd}</span>`;
  return html;
}

function buildE1rmChartDots(points, values, padX, padY, plotW, plotH, min, range) {
  const n = values.length;
  if (n < 2) return '';
  return points.map((p, i) => {
    const x = padX + (i / (n - 1)) * plotW;
    const y = padY + plotH - ((values[i] - min) / range) * plotH;
    let fill = '#A855F7';
    if (p.isDeload) fill = '#EAB308';
    else if (p.isCycleEnd) fill = '#3B82F6';
    else if (p.isCycleStart) fill = '#22C55E';
    let svg = `<circle cx="${x}" cy="${y}" r="4" fill="#1C1C21" /><circle cx="${x}" cy="${y}" r="3" fill="${fill}" />`;
    if (p.isDeload) {
      svg += `<text x="${x}" y="${y - 6}" text-anchor="middle" fill="#EAB308" font-size="9" font-weight="700">D</text>`;
    }
    if (p.isCycleEnd && !p.isDeload) {
      svg += `<text x="${x}" y="${y - 6}" text-anchor="middle" fill="#3B82F6" font-size="9" font-weight="700">CE</text>`;
    } else if (p.isCycleEnd && p.isDeload) {
      svg += `<text x="${x}" y="${y + 12}" text-anchor="middle" fill="#3B82F6" font-size="8" font-weight="700">CE</text>`;
    }
    if (p.isCycleStart && !p.isDeload && !p.isCycleEnd) {
      svg += `<text x="${x}" y="${y - 6}" text-anchor="middle" fill="#22C55E" font-size="9" font-weight="700">C1</text>`;
    }
    return svg;
  }).join('');
}

async function loadE1rmForExercise(exerciseId) {
  if (e1rmCache[exerciseId]) return e1rmCache[exerciseId];
  const workouts = await getUserWorkouts();
  if (workouts.length === 0) return [];
  const dateMap = {};
  workouts.forEach(w => { dateMap[w.id] = w.date; });
  const markers = await getCycleMarkerWorkoutIds();
  const chunks = [];
  const wids = workouts.map(w => w.id);
  for (let i = 0; i < wids.length; i += 30) chunks.push(wids.slice(i, i + 30));
  let allSets = [];
  for (const chunk of chunks) {
    const { data: sets } = await sbClient.from('sets').select('weight_kg, reps, rir, workout_id').eq('exercise_id', exerciseId).in('workout_id', chunk).eq('is_warmup', false).not('weight_kg', 'is', null).not('reps', 'is', null);
    if (sets) allSets = allSets.concat(sets);
  }
  if (allSets.length === 0) return [];
  const byWorkout = {};
  allSets.forEach(s => {
    if (!dateMap[s.workout_id]) return;
    if (!byWorkout[s.workout_id]) byWorkout[s.workout_id] = { workoutId: s.workout_id, date: dateMap[s.workout_id], sets: [] };
    byWorkout[s.workout_id].sets.push(s);
  });
  const points = Object.entries(byWorkout).map(([workoutId, w]) => {
    let best = 0;
    w.sets.forEach(s => {
      if (s.weight_kg && s.reps && s.reps <= 25) {
        const e1rm = s.weight_kg * (1 + (s.reps + (s.rir || 0)) / 30);
        if (e1rm > best) best = e1rm;
      }
    });
    return {
      workoutId,
      date: w.date,
      e1rm: best,
      isDeload: markers.deloadIds.has(workoutId),
      isCycleStart: markers.cycleStartIds.has(workoutId),
      isCycleEnd: markers.cycleEndIds.has(workoutId),
    };
  }).filter(p => p.e1rm > 0).sort((a, b) => a.date.localeCompare(b.date));
  trimCycleMarkers(points);
  e1rmCache[exerciseId] = points;
  return points;
}

async function loadAllSparklines(prs, unit, conv) {
  clearE1rmCaches();
  for (const pr of prs) {
    const sparkId = 'spark-' + pr.exercise_id.replace(/-/g, '');
    const points = await loadE1rmForExercise(pr.exercise_id);
    if (points.length >= 2) drawSparkline(sparkId, points, conv);
  }
}

function drawSparkline(elementId, points, conv) {
  const el = document.getElementById(elementId);
  if (!el || points.length < 2) { if (el) el.style.display = 'none'; return; }
  const values = points.map(p => p.e1rm * conv);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const trend = (values[values.length - 1] - values[0]) / (values[0] || 1);
  const color = trend > 0.02 ? '#22C55E' : trend < -0.02 ? '#EAB308' : '#6B7280';
  const vw = 200, vh = 28;
  const n = values.length;
  const coords = values.map((v, i) => ({
    x: (i / (n - 1)) * vw,
    y: vh - 2 - ((v - min) / range) * (vh - 4),
  }));
  const pts = coords.map(c => `${c.x},${c.y}`).join(' ');
  const dots = points.map((p, i) => {
    if (!p.isDeload && !p.isCycleStart && !p.isCycleEnd) return '';
    let fill = '#A855F7';
    if (p.isDeload) fill = '#EAB308';
    else if (p.isCycleEnd) fill = '#3B82F6';
    else if (p.isCycleStart) fill = '#22C55E';
    return `<circle cx="${coords[i].x}" cy="${coords[i].y}" r="3.5" fill="${fill}" stroke="#1C1C21" stroke-width="1" />`;
  }).join('');
  el.innerHTML = `<svg viewBox="0 0 ${vw} ${vh}" class="w-full h-full" preserveAspectRatio="xMidYMid meet"><polyline fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" points="${pts}" />${dots}</svg>`;
}

function renderWorkoutList(workouts, containerId) {
  if (workouts.length === 0) { document.getElementById(containerId).innerHTML = '<p class="text-text-secondary text-xs">No workouts yet</p>'; return; }
  document.getElementById(containerId).innerHTML = workouts.map(w => {
    const d = new Date(w.completed_at || w.date);
    const day = d.toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const dur = w.duration_seconds ? Math.round(w.duration_seconds / 60) + 'm' : '—';
    const rec = w.recovery_score ? `<span class="text-[10px] px-1 py-0.5 rounded ${w.recovery_score >= 4 ? 'bg-success/15 text-success' : w.recovery_score >= 3 ? 'bg-warning/15 text-warning' : 'bg-error/15 text-error'}">${w.recovery_score}/5</span>` : '';
    return `<div class="flex items-center gap-2 text-xs py-2 border-b border-border/50 last:border-0 cursor-pointer hover:bg-surface-2/50 rounded px-1 -mx-1 group" onclick="showWorkoutDetail('${w.id}')">
      <div class="flex-1 min-w-0">
        <div class="font-medium text-white">${day}</div>
        <div class="text-text-secondary mt-0.5">${w.exercise_count} exercises · ${w.working_set_count} sets · ${dur}</div>
      </div>
      <div class="flex items-center gap-1 flex-shrink-0">
        ${rec}
        <button class="text-text-disabled hover:text-error opacity-0 group-hover:opacity-100 transition-opacity p-1" onclick="event.stopPropagation();deleteWorkout('${w.id}')" title="Delete">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');
}

async function showWorkoutDetail(workoutId) {
  document.getElementById('workout-detail-modal').classList.remove('hidden');
  document.getElementById('workout-edit-btn').textContent = 'Edit';
  _workoutDetailEditing = false;
  const content = document.getElementById('workout-detail-content');
  content.innerHTML = '<p class="text-text-secondary text-sm">Loading workout...</p>';

  // Fetch workout exercises and sets
  const { data: exercises } = await sbClient.from('workout_exercises')
    .select('id, exercise_id, sort_order, tracking_type, weight_unit, exercises(name_en)')
    .eq('workout_id', workoutId)
    .order('sort_order');

  if (!exercises || exercises.length === 0) {
    content.innerHTML = '<p class="text-text-secondary text-sm">No exercises found.</p>';
    return;
  }

  // Fetch all sets for this workout
  const weIds = exercises.map(e => e.id);
  const { data: sets } = await sbClient.from('sets')
    .select('id, workout_exercise_id, set_number, weight_kg, reps, rir, is_warmup, technique_type')
    .in('workout_exercise_id', weIds)
    .order('set_number');

  // Store for edit mode
  const setsByEx = {};
  (sets || []).forEach(s => {
    if (!setsByEx[s.workout_exercise_id]) setsByEx[s.workout_exercise_id] = [];
    setsByEx[s.workout_exercise_id].push(s);
  });
  _workoutDetailData = { workoutId, exercises, sets: setsByEx };

  const unit = profileData.weight_unit || 'kg';
  const conv = unit === 'lb' ? 2.20462 : 1;

  // Get workout date for title
  const { data: workout } = await sbClient.from('v_workout_history').select('completed_at, duration_seconds, exercise_count, working_set_count').eq('id', workoutId).single();
  if (workout) {
    const d = new Date(workout.completed_at);
    document.getElementById('workout-detail-title').textContent = d.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
  }

  content.innerHTML = `
    ${workout ? `<div class="flex gap-3 mb-4 text-xs text-text-secondary"><span>${workout.exercise_count} exercises</span><span>·</span><span>${workout.working_set_count} working sets</span><span>·</span><span>${workout.duration_seconds ? Math.round(workout.duration_seconds / 60) + 'm' : '—'}</span></div>` : ''}
    ${exercises.map(ex => {
      const name = ex.exercises?.name_en || 'Unknown';
      const exSets = (setsByEx[ex.id] || []).filter(s => !s.is_warmup);
      const warmups = (setsByEx[ex.id] || []).filter(s => s.is_warmup);
      return `<div class="mb-4">
        <div class="text-sm font-semibold text-white mb-2">${name}</div>
        <div class="rounded-lg bg-surface-2 overflow-hidden">
          <table class="w-full text-xs">
            <thead><tr class="text-text-disabled border-b border-border/50"><th class="py-1.5 px-2 text-left font-medium w-8">#</th><th class="py-1.5 px-2 text-right font-medium">Weight</th><th class="py-1.5 px-2 text-right font-medium">Reps</th><th class="py-1.5 px-2 text-right font-medium">RIR</th></tr></thead>
            <tbody>
              ${warmups.map(s => `<tr class="text-text-disabled"><td class="py-1 px-2">W</td><td class="py-1 px-2 text-right">${s.weight_kg ? (s.weight_kg * conv).toFixed(1) : '—'}</td><td class="py-1 px-2 text-right">${s.reps ?? '—'}</td><td class="py-1 px-2 text-right">—</td></tr>`).join('')}
              ${exSets.map((s, i) => `<tr class="text-white"><td class="py-1 px-2 text-text-secondary">${i + 1}</td><td class="py-1 px-2 text-right font-medium">${s.weight_kg ? (s.weight_kg * conv).toFixed(1) + ' ' + unit : '—'}</td><td class="py-1 px-2 text-right">${s.reps ?? '—'}</td><td class="py-1 px-2 text-right text-text-secondary">${s.rir != null ? s.rir : '—'}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
    }).join('')}
  `;
}
function hideWorkoutDetail() { document.getElementById('workout-detail-modal').classList.add('hidden'); _workoutDetailEditing = false; }

let _workoutDetailEditing = false;
let _workoutDetailData = { workoutId: null, exercises: [], sets: {} };

function toggleWorkoutEdit() {
  _workoutDetailEditing = !_workoutDetailEditing;
  const btn = document.getElementById('workout-edit-btn');
  if (_workoutDetailEditing) {
    btn.textContent = 'Save';
    renderWorkoutDetailEditable();
  } else {
    btn.textContent = 'Edit';
    saveWorkoutEdits();
  }
}

function renderWorkoutDetailEditable() {
  const content = document.getElementById('workout-detail-content');
  const unit = profileData.weight_unit || 'kg';
  const conv = unit === 'lb' ? 2.20462 : 1;

  content.innerHTML = `
    ${_workoutDetailData.exercises.map(ex => {
      const name = ex.exercises?.name_en || 'Unknown';
      const exSets = (_workoutDetailData.sets[ex.id] || []).filter(s => !s.is_warmup);
      return `<div class="mb-4">
        <div class="text-sm font-semibold text-white mb-2">${name}</div>
        <div class="rounded-lg bg-surface-2 overflow-hidden">
          <table class="w-full text-xs">
            <thead><tr class="text-text-disabled border-b border-border/50"><th class="py-1.5 px-2 text-left font-medium w-8">#</th><th class="py-1.5 px-2 text-right font-medium">Weight (${unit})</th><th class="py-1.5 px-2 text-right font-medium">Reps</th><th class="py-1.5 px-2 text-right font-medium">RIR</th></tr></thead>
            <tbody>
              ${exSets.map((s, i) => `<tr>
                <td class="py-1 px-2 text-text-secondary">${i + 1}</td>
                <td class="py-1 px-2 text-right"><input type="number" step="0.5" class="edit-input w-16" value="${s.weight_kg ? (s.weight_kg * conv).toFixed(1) : ''}" data-set-id="${s.id}" data-field="weight" /></td>
                <td class="py-1 px-2 text-right"><input type="number" class="edit-input w-12" value="${s.reps ?? ''}" data-set-id="${s.id}" data-field="reps" /></td>
                <td class="py-1 px-2 text-right"><input type="number" min="0" max="10" class="edit-input w-10" value="${s.rir != null ? s.rir : ''}" data-set-id="${s.id}" data-field="rir" /></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
    }).join('')}
  `;
}

async function saveWorkoutEdits() {
  const unit = profileData.weight_unit || 'kg';
  const conv = unit === 'lb' ? 2.20462 : 1;
  const inputs = document.querySelectorAll('#workout-detail-content input[data-set-id]');
  const updates = {};

  inputs.forEach(input => {
    const setId = input.dataset.setId;
    const field = input.dataset.field;
    if (!updates[setId]) updates[setId] = {};
    const val = input.value.trim();
    if (field === 'weight') {
      updates[setId].weight_kg = val ? parseFloat(val) / conv : null;
    } else if (field === 'reps') {
      updates[setId].reps = val ? parseInt(val) : null;
    } else if (field === 'rir') {
      updates[setId].rir = val ? parseInt(val) : null;
    }
  });

  let success = true;
  for (const [setId, data] of Object.entries(updates)) {
    const updatePayload = {};
    if (data.weight_kg !== undefined) updatePayload.weight_kg = data.weight_kg;
    if (data.reps !== undefined) updatePayload.reps = data.reps;
    if (data.rir !== undefined) updatePayload.rir = data.rir;
    if (Object.keys(updatePayload).length > 0) {
      const { error } = await sbClient.from('sets').update(updatePayload).eq('id', setId);
      if (error) success = false;
    }
  }

  if (success) { toast('Workout updated', 'success'); clearE1rmCaches(); cacheInvalidate('dashboard_' + currentUser.id); }
  else toast('Some changes failed to save', 'error');

  // Reload the detail view in read mode
  showWorkoutDetail(_workoutDetailData.workoutId);
}

async function deleteWorkout(workoutId) {
  if (!confirm('Delete this workout? This cannot be undone.')) return;
  const { error } = await sbClient.from('workouts').delete().eq('id', workoutId).eq('user_id', currentUser.id);
  if (error) { toast('Delete failed: ' + error.message, 'error'); return; }
  toast('Workout deleted', 'success');
  clearE1rmCaches();
  cacheInvalidate('dashboard_' + currentUser.id);
  loadAll(true);
}

// ── Programs ──────────────────────────────────────────────────
let programBuilderState = { id: null, days: [] };

function renderProgramList(programs, activeProgram) {
  if (programs.length === 0) { document.getElementById('program-list').innerHTML = '<div class="glass p-8 text-center"><p class="text-text-secondary text-sm">No programs yet</p><button class="btn-primary mt-3" onclick="showProgramBuilder()">Create your first program</button></div>'; return; }
  const activeId = activeProgram?.id;
  document.getElementById('program-list').innerHTML = programs.map(p => {
    const weeks = p.mesocycle_length_weeks || '—';
    const deload = p.final_week_is_deload ? '· Deload W' + weeks : '';
    const isActive = p.id === activeId;
    const activeBadge = isActive ? '<span class="text-[10px] bg-success/15 text-success px-2 py-0.5 rounded-full font-semibold">Active</span>' : `<button class="text-[10px] bg-violet/10 text-violet px-2 py-0.5 rounded-full font-semibold hover:bg-violet/20" onclick="event.stopPropagation();setActiveProgram('${p.id}')">Set Active</button>`;
    const border = isActive ? 'border-success/30' : 'border-border';
    return `<div class="glass ${border} p-4 flex items-center justify-between cursor-pointer hover:border-violet/30" onclick="editProgram('${p.id}')"><div><div class="flex items-center gap-2"><span class="text-sm font-semibold text-white">${p.name}</span>${activeBadge}</div><div class="text-[10px] text-text-secondary mt-0.5">${p.goal || 'hypertrophy'} · ${weeks}w ${deload}</div></div><div class="flex items-center gap-2"><span class="text-xs text-violet">Edit →</span></div></div>`;
  }).join('');
}

async function setActiveProgram(programId) {
  const { error } = await sbClient.from('users').update({ active_program_id: programId }).eq('id', currentUser.id);
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  toast('Active program updated', 'success');
  cacheInvalidate('dashboard_' + currentUser.id);
  loadAll(true);
}

function showProgramBuilder(programId) {
  document.getElementById('program-list-view').classList.add('hidden');
  document.getElementById('program-builder').classList.remove('hidden');
  if (!programId) { programBuilderState = { id: null, days: [{ label: 'Day 1', exercises: [] }] }; document.getElementById('pb-name').value = ''; document.getElementById('builder-title').textContent = 'New Program'; renderBuilderDays(); }
}
function hideProgramBuilder() {
  document.getElementById('program-list-view').classList.remove('hidden');
  document.getElementById('program-builder').classList.add('hidden');
}

async function editProgram(id) {
  // Always fetch fresh data when editing (bypass cache)
  _userWorkoutsCache = null;
  const { data: prog } = await sbClient.from('programs').select('*').eq('id', id).single();
  const { data: days } = await sbClient.from('program_days').select('*, program_exercises(*, exercises(name_en, name_es, muscles_primary))').eq('program_id', id).order('day_number');
  if (!prog) return;
  programBuilderState = { id: prog.id, days: (days || []).map(d => ({ id: d.id, label: d.label || 'Day ' + d.day_number, muscleFocus: d.muscle_focus || [], exercises: (d.program_exercises || []).sort((a, b) => (a.set_order || 0) - (b.set_order || 0)).map(e => ({ id: e.id, exerciseId: e.exercise_id, name: e.exercises?.name_en || 'Unknown', sets: e.sets, repsTarget: e.reps_target, muscles: e.exercises?.muscles_primary || [] })) })) };
  document.getElementById('pb-name').value = prog.name;
  setChipGroup('pb-goal-group', 'goal', prog.goal || 'hypertrophy');
  setChipGroup('pb-meso-group', 'meso', String(prog.mesocycle_length_weeks || 8));
  document.getElementById('pb-deload').classList.toggle('on', prog.final_week_is_deload !== false);
  document.getElementById('pb-repeat').classList.toggle('on', prog.auto_repeat_block === true);
  document.getElementById('builder-title').textContent = 'Edit: ' + prog.name;
  showProgramBuilder(id);
  renderBuilderDays();
}

function renderBuilderDays() {
  const container = document.getElementById('pb-days');
  container.innerHTML = programBuilderState.days.map((day, di) => `
    <div class="bg-surface border border-border rounded-xl flex flex-col min-h-[300px]" data-day="${di}">
      <!-- Day header -->
      <div class="p-2.5 border-b border-border">
        <div class="flex items-center justify-between mb-1">
          <span class="text-[10px] text-text-secondary font-bold uppercase">Day ${di + 1}</span>
          <div class="flex items-center gap-1">
            <span class="text-[9px] text-text-disabled">${day.exercises.reduce((s, e) => s + (e.sets || 0), 0)} sets</span>
            <button class="text-[10px] text-error hover:text-error/80 ml-1" onclick="removeDay(${di})" title="Remove day">✕</button>
          </div>
        </div>
        <input class="form-input text-xs py-1" value="${day.label}" onchange="programBuilderState.days[${di}].label=this.value" placeholder="Day name" />
      </div>
      <!-- Exercises (droppable zone) -->
      <div class="flex-1 p-2 space-y-1.5 overflow-y-auto" id="pb-day-${di}-zone" ondragover="event.preventDefault();this.classList.add('bg-violet/5')" ondragleave="this.classList.remove('bg-violet/5')" ondrop="handleDrop(event,${di});this.classList.remove('bg-violet/5')">
        ${day.exercises.map((ex, ei) => `
          <div class="p-2 rounded-lg bg-surface-2 border border-border cursor-grab active:cursor-grabbing" draggable="true" ondragstart="handleDragStart(event,${di},${ei})">
            <div class="flex items-center justify-between mb-1">
              <span class="text-[10px] font-semibold text-white leading-tight truncate flex-1 mr-1">${ex.name}</span>
              <div class="flex items-center gap-0.5 flex-shrink-0">
                ${ei > 0 ? `<button class="text-[9px] text-text-disabled hover:text-white p-0.5" onclick="event.stopPropagation();reorderExercise(${di},${ei},-1)" title="Move up">▲</button>` : ''}
                ${ei < day.exercises.length - 1 ? `<button class="text-[9px] text-text-disabled hover:text-white p-0.5" onclick="event.stopPropagation();reorderExercise(${di},${ei},1)" title="Move down">▼</button>` : ''}
                ${di > 0 ? `<button class="text-[9px] text-text-disabled hover:text-violet p-0.5" onclick="event.stopPropagation();moveExercise(${di},${ei},${di-1})" title="Move to prev day">◀</button>` : ''}
                ${di < programBuilderState.days.length - 1 ? `<button class="text-[9px] text-text-disabled hover:text-violet p-0.5" onclick="event.stopPropagation();moveExercise(${di},${ei},${di+1})" title="Move to next day">▶</button>` : ''}
                <button class="text-[9px] text-text-disabled hover:text-error p-0.5" onclick="event.stopPropagation();removeExercise(${di},${ei})" title="Remove">✕</button>
              </div>
            </div>
            <div class="flex items-center gap-1">
              <input type="number" class="edit-input w-7 text-center text-[10px]" value="${ex.sets}" min="1" max="10" onchange="programBuilderState.days[${di}].exercises[${ei}].sets=+this.value;renderBuilderDays()" onclick="event.stopPropagation()" />
              <span class="text-[8px] text-text-disabled">×</span>
              <input class="edit-input w-12 text-center text-[10px]" value="${ex.repsTarget || ''}" onchange="programBuilderState.days[${di}].exercises[${ei}].repsTarget=this.value" placeholder="8-12" onclick="event.stopPropagation()" />
            </div>
          </div>
        `).join('')}
      </div>
      <!-- Add exercise -->
      <div class="p-2 border-t border-border">
        <button class="w-full text-[10px] text-violet font-semibold py-1.5 rounded-lg hover:bg-violet/10 flex items-center justify-center gap-1" onclick="showExercisePicker(${di})">+ Add Exercise</button>
      </div>
    </div>
  `).join('');
}

// Drag and drop between days
let _dragSource = null;
function handleDragStart(event, dayIdx, exIdx) {
  _dragSource = { dayIdx, exIdx };
  event.dataTransfer.effectAllowed = 'move';
  event.target.style.opacity = '0.5';
  setTimeout(() => { if (event.target) event.target.style.opacity = '1'; }, 0);
}
function handleDrop(event, targetDayIdx) {
  event.preventDefault();
  if (!_dragSource) return;
  const { dayIdx: srcDay, exIdx: srcEx } = _dragSource;
  if (srcDay === targetDayIdx) return; // same day — reorder not implemented via drag yet
  moveExercise(srcDay, srcEx, targetDayIdx);
  _dragSource = null;
}
function moveExercise(fromDay, exIdx, toDay) {
  const ex = programBuilderState.days[fromDay].exercises.splice(exIdx, 1)[0];
  programBuilderState.days[toDay].exercises.push(ex);
  renderBuilderDays();
}
function reorderExercise(dayIdx, exIdx, direction) {
  const exercises = programBuilderState.days[dayIdx].exercises;
  const newIdx = exIdx + direction;
  if (newIdx < 0 || newIdx >= exercises.length) return;
  const temp = exercises[exIdx];
  exercises[exIdx] = exercises[newIdx];
  exercises[newIdx] = temp;
  renderBuilderDays();
}

function addDay() {
  const n = programBuilderState.days.length + 1;
  programBuilderState.days.push({ label: 'Day ' + n, exercises: [] });
  renderBuilderDays();
}
function removeDay(i) { programBuilderState.days.splice(i, 1); renderBuilderDays(); }
function removeExercise(di, ei) { programBuilderState.days[di].exercises.splice(ei, 1); renderBuilderDays(); }

async function showExercisePicker(dayIndex) {
  const query = prompt('Search exercise name:');
  if (!query || query.length < 2) return;
  const { data: results } = await sbClient.from('exercises').select('id, name_en, muscles_primary').ilike('name_en', `%${query}%`).limit(10);
  if (!results || results.length === 0) { toast('No exercises found', 'error'); return; }
  // Show simple selection
  const pick = results.length === 1 ? results[0] : results[await pickFromList(results.map(r => r.name_en))];
  if (!pick) return;
  programBuilderState.days[dayIndex].exercises.push({ exerciseId: pick.id, name: pick.name_en, sets: 3, repsTarget: '8-12', muscles: pick.muscles_primary || [] });
  renderBuilderDays();
}

function pickFromList(items) {
  const choice = prompt('Multiple results:\n' + items.map((n, i) => `${i + 1}. ${n}`).join('\n') + '\n\nEnter number:');
  const idx = parseInt(choice) - 1;
  return idx >= 0 && idx < items.length ? idx : null;
}

async function saveProgram() {
  const name = document.getElementById('pb-name').value.trim();
  if (!name) { toast('Enter a program name', 'error'); return; }
  const goal = document.querySelector('#pb-goal-group .chip.active')?.dataset.goal || 'hypertrophy';
  const meso = parseInt(document.querySelector('#pb-meso-group .chip.active')?.dataset.meso) || 8;
  const deload = document.getElementById('pb-deload').classList.contains('on');
  const repeat = document.getElementById('pb-repeat').classList.contains('on');

  try {
    let progId = programBuilderState.id;
    if (progId) {
      // Update existing
      await sbClient.from('programs').update({ name, goal, mesocycle_length_weeks: meso, final_week_is_deload: deload, auto_repeat_block: repeat }).eq('id', progId);
    } else {
      // Create new
      const { data } = await sbClient.from('programs').insert({ user_id: currentUser.id, name, goal, mesocycle_length_weeks: meso, final_week_is_deload: deload, auto_repeat_block: repeat, is_template: false }).select().single();
      progId = data.id;
    }

    // Save days + exercises
    if (programBuilderState.id) {
      // UPDATE existing program — don't delete/recreate (RLS blocks cascade deletes)
      // Instead: update each day's label and muscle_focus, then sync exercises per day
      const { data: existingDays } = await sbClient.from('program_days').select('id, day_number').eq('program_id', progId).order('day_number');
      const existingDayIds = (existingDays || []).map(d => d.id);

      // Remove extra days if we now have fewer
      for (let i = programBuilderState.days.length; i < existingDayIds.length; i++) {
        await sbClient.from('program_exercises').delete().eq('program_day_id', existingDayIds[i]);
        await sbClient.from('program_days').delete().eq('id', existingDayIds[i]);
      }

      // Update or create each day
      for (let i = 0; i < programBuilderState.days.length; i++) {
        const day = programBuilderState.days[i];
        const muscles = [...new Set(day.exercises.flatMap(e => e.muscles || []))];
        let dayId;

        if (i < existingDayIds.length) {
          // Update existing day
          dayId = existingDayIds[i];
          await sbClient.from('program_days').update({ day_number: i + 1, label: day.label, muscle_focus: muscles }).eq('id', dayId);
          // Delete old exercises for this day, then reinsert
          await sbClient.from('program_exercises').delete().eq('program_day_id', dayId);
        } else {
          // Create new day
          const { data: dayRow } = await sbClient.from('program_days').insert({ program_id: progId, day_number: i + 1, label: day.label, muscle_focus: muscles }).select().single();
          dayId = dayRow?.id;
        }

        if (dayId && day.exercises.length > 0) {
          const exRows = day.exercises.map((ex, ei) => ({ program_day_id: dayId, exercise_id: ex.exerciseId, set_order: ei + 1, sets: ex.sets || 3, reps_target: ex.repsTarget || '8-12' }));
          await sbClient.from('program_exercises').insert(exRows);
        }
      }
    } else {
      // NEW program — just insert days and exercises
      for (let i = 0; i < programBuilderState.days.length; i++) {
        const day = programBuilderState.days[i];
        const muscles = [...new Set(day.exercises.flatMap(e => e.muscles || []))];
        const { data: dayRow, error: dayErr } = await sbClient.from('program_days').insert({ program_id: progId, day_number: i + 1, label: day.label, muscle_focus: muscles }).select().single();
        if (dayErr) { console.error('Insert day failed:', dayErr.message); continue; }
        if (dayRow && day.exercises.length > 0) {
          const exRows = day.exercises.map((ex, ei) => ({ program_day_id: dayRow.id, exercise_id: ex.exerciseId, set_order: ei + 1, sets: ex.sets || 3, reps_target: ex.repsTarget || '8-12' }));
          await sbClient.from('program_exercises').insert(exRows);
        }
      }
    }

    toast('Program saved!', 'success');
    hideProgramBuilder();
    clearE1rmCaches();
    cacheInvalidate('dashboard_' + currentUser.id);
    loadAll(true); // Refresh
  } catch (e) { toast('Error: ' + e.message, 'error'); }
}

function setPbGoal(v) { setChipGroup('pb-goal-group', 'goal', v); }
function setPbMeso(v) { setChipGroup('pb-meso-group', 'meso', String(v)); }

// ── Personal Records (full page) ──────────────────────────────
let allPrsData = [];

function prSubtitle(pr, unit, conv) {
  const metric = pr.pr_metric || 'e1rm';
  if (metric === 'reps') return pr.best_reps ? `Best: ${pr.best_reps} reps` : '—';
  if (metric === 'weight') {
    if (!pr.best_weight_kg) return '—';
    const w = (pr.best_weight_kg * conv).toFixed(1) + ' ' + unit;
    const r = pr.reps_at_best_weight ? ' × ' + pr.reps_at_best_weight + ' reps' : '';
    return 'Best: ' + w + r;
  }
  const w = pr.best_weight_kg ? (pr.best_weight_kg * conv).toFixed(1) + ' ' + unit : '—';
  const e = pr.best_e1rm_kg ? '  ·  e1RM ~' + (pr.best_e1rm_kg * conv).toFixed(1) + ' ' + unit : '';
  return 'Best: ' + w + e;
}

async function showE1rmDetail(exerciseId, exerciseName) {
  document.getElementById('e1rm-detail-modal').classList.remove('hidden');
  document.getElementById('e1rm-detail-title').textContent = exerciseName;
  const content = document.getElementById('e1rm-detail-content');
  content.innerHTML = '<p class="text-text-secondary text-sm">Loading e1RM history...</p>';

  const unit = profileData.weight_unit || 'kg';
  const conv = unit === 'lb' ? 2.20462 : 1;

  delete e1rmCache[exerciseId];
  _cycleContextCache = null;
  const points = await loadE1rmForExercise(exerciseId);

  if (points.length === 0) { content.innerHTML = '<p class="text-text-secondary text-sm">No e1RM data for this exercise.</p>'; return; }

  const markedCount = points.filter(p => p.isDeload || p.isCycleStart || p.isCycleEnd).length;

  const values = points.map(p => p.e1rm * conv);
  const latestNonDeload = [...points].reverse().find(p => !p.isDeload) || points[points.length - 1];
  const latest = (latestNonDeload.e1rm * conv).toFixed(1);
  const best = Math.max(...values).toFixed(1);
  const firstVal = values[0];
  const latestVal = latestNonDeload.e1rm * conv;
  const change = (latestVal - firstVal).toFixed(1);
  const changePct = firstVal > 0 ? ((latestVal - firstVal) / firstVal * 100).toFixed(1) : '0.0';
  const sign = change > 0 ? '+' : '';
  const locale = profileData.locale === 'es' ? 'es' : 'en';

  // Large chart
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  // Chart dimensions — proper aspect ratio, no distortion
  const chartW = Math.max(points.length * 14, 300);
  const chartH = 140;
  const padX = 10, padY = 14;
  const plotW = chartW - padX * 2;
  const plotH = chartH - padY * 2;
  const markerLegend = markedCount > 0 ? `<div class="flex flex-wrap gap-3 mb-3 text-[10px] text-text-secondary"><span class="text-warning font-semibold">D Deload</span><span class="text-success font-semibold">C1 Cycle start</span><span class="text-info font-semibold">CE Cycle end</span></div>` : '';

  content.innerHTML = `
    ${markerLegend}
    <div class="grid grid-cols-3 gap-3 mb-5">
      <div class="rounded-xl bg-surface-2 p-3 text-center"><div class="text-[10px] text-text-disabled uppercase">Current</div><div class="text-lg font-black text-white">${latest}</div><div class="text-[10px] text-text-disabled">${unit}</div></div>
      <div class="rounded-xl bg-surface-2 p-3 text-center"><div class="text-[10px] text-text-disabled uppercase">All-Time Best</div><div class="text-lg font-black text-warning">${best}</div><div class="text-[10px] text-text-disabled">${unit}</div></div>
      <div class="rounded-xl bg-surface-2 p-3 text-center"><div class="text-[10px] text-text-disabled uppercase">Change</div><div class="text-lg font-black ${change > 0 ? 'text-success' : change < 0 ? 'text-error' : 'text-text-secondary'}">${sign}${change}</div><div class="text-[10px] text-text-disabled">${sign}${changePct}%</div></div>
    </div>
    <div class="rounded-xl bg-surface-2 p-4 mb-4 overflow-x-auto">
      <svg width="${chartW}" height="${chartH}" viewBox="0 0 ${chartW} ${chartH}" class="w-full" style="min-width:${chartW}px">
        <line x1="${padX}" y1="${padY}" x2="${chartW - padX}" y2="${padY}" stroke="#2E2E35" stroke-width="0.5"/>
        <line x1="${padX}" y1="${chartH/2}" x2="${chartW - padX}" y2="${chartH/2}" stroke="#2E2E35" stroke-width="0.5"/>
        <line x1="${padX}" y1="${chartH - padY}" x2="${chartW - padX}" y2="${chartH - padY}" stroke="#2E2E35" stroke-width="0.5"/>
        <polyline fill="none" stroke="#A855F7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          points="${values.map((v, i) => `${padX + (i / (values.length - 1)) * plotW},${padY + plotH - ((v - min) / range) * plotH}`).join(' ')}" />
        ${buildE1rmChartDots(points, values, padX, padY, plotW, plotH, min, range)}
      </svg>
      <div class="flex justify-between mt-2 text-[9px] text-text-disabled">
        <span>${points[0].date}</span>
        <span>${points[points.length - 1].date}</span>
      </div>
    </div>
    <div class="text-[10px] text-text-disabled font-bold uppercase tracking-wide mb-2">Session History</div>
    <div class="space-y-1 max-h-48 overflow-y-auto">
      ${points.slice().reverse().slice(0, 20).map(p => `<div class="flex items-center justify-between text-xs py-1.5 border-b border-border/50"><span class="text-text-secondary flex items-center flex-wrap">${new Date(p.date).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: '2-digit' })}${markerBadgesHtml(p)}</span><span class="font-bold text-white flex-shrink-0 ml-2">${(p.e1rm * conv).toFixed(1)} ${unit}</span></div>`).join('')}
    </div>
  `;
}
function hideE1rmDetail() { document.getElementById('e1rm-detail-modal').classList.add('hidden'); }

// PR Picker
function showPRPicker() {
  document.getElementById('pr-picker-modal').classList.remove('hidden');
  renderPRPickerList(allPrsData);
}
function hidePRPicker() { document.getElementById('pr-picker-modal').classList.add('hidden'); }

function renderPRPickerList(prs) {
  const unit = profileData.weight_unit || 'kg';
  const conv = unit === 'lb' ? 2.20462 : 1;
  document.getElementById('pr-picker-list').innerHTML = prs.map(pr => {
    const name = pr.exercises?.name_en || 'Unknown';
    const checked = pr.isTracked ? 'checked' : '';
    return `<div class="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-2">
      <input type="checkbox" ${checked} class="w-4 h-4 accent-violet-dark rounded" onchange="toggleTrackExercise('${pr.exercise_id}', this.checked)" />
      <div class="flex-1 min-w-0"><div class="text-xs font-medium text-white truncate">${name}</div><div class="text-[10px] text-text-disabled">${pr.total_sets} sets logged</div></div>
      ${pr.best_e1rm_kg ? `<span class="text-xs text-text-secondary">${(pr.best_e1rm_kg * conv).toFixed(1)} ${unit}</span>` : ''}
    </div>`;
  }).join('');
}

function filterPRPicker(query) {
  const q = query.toLowerCase();
  const filtered = allPrsData.filter(pr => (pr.exercises?.name_en || '').toLowerCase().includes(q));
  renderPRPickerList(filtered);
}

async function toggleTrackExercise(exerciseId, tracked) {
  await sbClient.from('user_exercise_preferences').upsert({ user_id: currentUser.id, exercise_id: exerciseId, is_tracked: tracked, is_pinned: false }, { onConflict: 'user_id,exercise_id' });
  // Update local state
  const pr = allPrsData.find(p => p.exercise_id === exerciseId);
  if (pr) { pr.isTracked = tracked; if (!tracked) pr.isPinned = false; }
  const unit = profileData.weight_unit || 'kg';
  const conv = unit === 'lb' ? 2.20462 : 1;
  renderPRList(allPrsData, 'ov-prs-list', unit, conv);
}

async function togglePin(exerciseId, pin) {
  const { error } = await sbClient.from('user_exercise_preferences').upsert({ user_id: currentUser.id, exercise_id: exerciseId, is_tracked: true, is_pinned: pin }, { onConflict: 'user_id,exercise_id' });
  if (error) { toast('Max 3 pinned', 'error'); return; }
  const pr = allPrsData.find(p => p.exercise_id === exerciseId);
  if (pr) pr.isPinned = pin;
  // Re-sort: pinned first
  allPrsData.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    if (a.isTracked !== b.isTracked) return a.isTracked ? -1 : 1;
    return new Date(b.last_pr_date || 0) - new Date(a.last_pr_date || 0);
  });
  const unit = profileData.weight_unit || 'kg';
  const conv = unit === 'lb' ? 2.20462 : 1;
  renderPRList(allPrsData, 'ov-prs-list', unit, conv);
  cacheInvalidate('dashboard_' + currentUser.id);
  toast(pin ? 'Pinned' : 'Unpinned', 'success');
}

// ── Profile ───────────────────────────────────────────────────
function populateProfile(user) {
  if (!user) return;
  document.getElementById('pf-name').value = user.display_name || '';
  document.getElementById('pf-email').value = currentUser.email || '';
  document.getElementById('pf-dob').value = user.birth_date || '';
  const unit = user.weight_unit || 'kg'; const conv = unit === 'lb' ? 2.20462 : 1;
  const w = user.bodyweight_kg ? (user.bodyweight_kg * conv).toFixed(1) : '';
  document.getElementById('pf-weight').value = w === '0.0' ? '' : w;
  setChipGroup('pf-unit-group', 'unit', unit);
  setChipGroup('pf-sex-group', 'sex', user.sex || 'prefer_not_to_say');
  setTileGroup('pf-env-group', 'env', user.training_environment || 'commercial_gym');
  setChipGroup('pf-level-group', 'level', user.level || 'beginner');
  setChipGroup('pf-days-group', 'days', String(user.days_per_week || 4));
  (user.injury_flags || []).forEach(inj => { const el = document.querySelector(`#pf-injuries-group [data-injury="${inj}"]`); if (el) el.classList.add('active'); });
}
function setPfUnit(v) { setChipGroup('pf-unit-group', 'unit', v); }
function setPfSex(v) { setChipGroup('pf-sex-group', 'sex', v); }
function setPfEnv(v) { setTileGroup('pf-env-group', 'env', v); }
function setPfLevel(v) { setChipGroup('pf-level-group', 'level', v); }
function setPfDays(v) { setChipGroup('pf-days-group', 'days', String(v)); }
function togglePfInjury(v) { document.querySelector(`#pf-injuries-group [data-injury="${v}"]`).classList.toggle('active'); }

async function saveProfile() {
  const unit = document.querySelector('#pf-unit-group .chip.active')?.dataset.unit || 'kg';
  const raw = parseFloat(document.getElementById('pf-weight').value) || 0;
  const kg = unit === 'lb' ? raw / 2.20462 : raw;
  const injuries = []; document.querySelectorAll('#pf-injuries-group .chip.active').forEach(el => injuries.push(el.dataset.injury));
  const updates = { display_name: document.getElementById('pf-name').value.trim(), bodyweight_kg: Math.round(kg * 10) / 10, weight_unit: unit, birth_date: document.getElementById('pf-dob').value || null, sex: document.querySelector('#pf-sex-group .chip.active')?.dataset.sex || 'prefer_not_to_say', training_environment: document.querySelector('#pf-env-group .select-tile.active')?.dataset.env || 'commercial_gym', level: document.querySelector('#pf-level-group .chip.active')?.dataset.level || 'beginner', days_per_week: parseInt(document.querySelector('#pf-days-group .chip.active')?.dataset.days) || 4, injury_flags: injuries };
  const { error } = await sbClient.from('users').update(updates).eq('id', currentUser.id);
  if (error) toast('Error: ' + error.message, 'error'); else { toast('Profile saved', 'success'); profileData = { ...profileData, ...updates }; cacheInvalidate('dashboard_' + currentUser.id); }
}

// ── Settings ──────────────────────────────────────────────────
function populateSettings(user) {
  if (!user) return;
  setChipGroup('st-locale-group', 'locale', user.locale || 'en');
  document.getElementById('toggle-ai').classList.toggle('on', user.ai_watch_mode === 'assist');
  setChipGroup('st-freq-group', 'freq', user.coach_frequency || 'medium');
  setChipGroup('st-style-group', 'style', user.coach_style || 'balanced');
  document.getElementById('toggle-notify').classList.toggle('on', user.notify_falling_behind || false);
}
function setStLocale(v) { setChipGroup('st-locale-group', 'locale', v); }
function setStFreq(v) { setChipGroup('st-freq-group', 'freq', v); }
function setStStyle(v) { setChipGroup('st-style-group', 'style', v); }

async function saveSettings() {
  const updates = { locale: document.querySelector('#st-locale-group .chip.active')?.dataset.locale || 'en', ai_watch_mode: document.getElementById('toggle-ai').classList.contains('on') ? 'assist' : 'off', coach_frequency: document.querySelector('#st-freq-group .chip.active')?.dataset.freq || 'medium', coach_style: document.querySelector('#st-style-group .chip.active')?.dataset.style || 'balanced', notify_falling_behind: document.getElementById('toggle-notify').classList.contains('on') };
  const { error } = await sbClient.from('users').update(updates).eq('id', currentUser.id);
  if (error) toast('Error: ' + error.message, 'error'); else { toast('Settings saved', 'success'); cacheInvalidate('dashboard_' + currentUser.id); }
}

// ── Helpers ───────────────────────────────────────────────────
function setChipGroup(id, attr, val) { document.querySelectorAll(`#${id} .chip`).forEach(el => el.classList.toggle('active', el.dataset[attr] === val)); }
function setTileGroup(id, attr, val) { document.querySelectorAll(`#${id} .select-tile`).forEach(el => el.classList.toggle('active', el.dataset[attr] === val)); }
function fmtNum(n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n); }
function isoWeek(d) { const t = new Date(d); t.setHours(0,0,0,0); t.setDate(t.getDate() + 3 - (t.getDay() + 6) % 7); const w1 = new Date(t.getFullYear(), 0, 4); return t.getFullYear() + '-W' + String(Math.round(((t - w1) / 86400000 + 1) / 7) + 1).padStart(2, '0'); }
function getWeekStart(d) { const r = new Date(d); const day = r.getDay(); r.setDate(r.getDate() - day + (day === 0 ? -6 : 1)); r.setHours(0,0,0,0); return r; }
function toast(msg, type) { const t = document.getElementById('toast'); t.textContent = msg; t.className = 'toast ' + type + ' show'; setTimeout(() => t.classList.remove('show'), 3000); }

// ── Boot ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Ensure Supabase CDN has loaded
  if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
    console.error('Supabase JS library not loaded');
    const err = document.getElementById('login-error');
    if (err) { err.textContent = 'Failed to load Supabase library. Check your connection.'; err.classList.remove('hidden'); }
    return;
  }
  init().catch(e => console.error('Init failed:', e));
});
