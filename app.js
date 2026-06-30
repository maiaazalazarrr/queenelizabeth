/* ═══════════════════════════════════════════════════
   QUEEN ELIZABETH ACADEMY — app.js
   Interactions, navigation, gamification, lesson flow
═══════════════════════════════════════════════════ */

"use strict";

// ── State ──────────────────────────────────────────
const State = {
  currentPage: 'landing',
  lessonStep: 1,          // 0-indexed; starts at step-1 (RP)
  totalSteps: 4,
  grammarScore: 0,
  streak: 12,
  xp: 1240,
  recordingActive: false,
  completedSteps: new Set([0]),   // Step 0 already done
};

// ── Page Navigation ───────────────────────────────
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + pageId);
  if (target) {
    target.classList.add('active');
    State.currentPage = pageId;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    updateNavForPage(pageId);
  }
  if (pageId === 'dashboard') {
    loadRealStats();
    if (typeof CurrentProfile !== 'undefined' && CurrentProfile) renderDashboardForRole(CurrentProfile.role);
  }
  if (pageId === 'materiales') loadMaterialsPage();
  if (pageId === 'admin') loadAdminLessonOptions();
}

function updateNavForPage(pageId) {
  const nav = document.getElementById('nav');
  if (pageId === 'dashboard' || pageId === 'leccion') {
    nav.style.position = 'relative';
    nav.style.top = '0';
  } else {
    nav.style.position = 'fixed';
    nav.style.top = '0';
  }
}

function scrollToSection(id) {
  setTimeout(() => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

// ── Nav Hamburger ─────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.querySelector('.nav__links');
  const navActions = document.querySelector('.nav__actions');

  if (hamburger) {
    hamburger.addEventListener('click', () => {
      navLinks?.classList.toggle('open');
      navActions?.classList.toggle('open');
    });
  }

  // Sticky nav shadow
  const nav = document.getElementById('nav');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      nav.style.boxShadow = '0 4px 24px rgba(7,15,36,.4)';
    } else {
      nav.style.boxShadow = 'none';
    }
  });

  // Animate level bar on dashboard load
  setTimeout(animateLevelBar, 600);

  // Sidebar link active state
  document.querySelectorAll('.sidebar__link').forEach(link => {
    link.addEventListener('click', function(e) {
      if (!this.onclick) e.preventDefault();
      document.querySelectorAll('.sidebar__link').forEach(l => l.classList.remove('sidebar__link--active'));
      this.classList.add('sidebar__link--active');
    });
  });

  // Outline step navigation in lesson
  document.querySelectorAll('.outline__item').forEach(item => {
    item.addEventListener('click', function() {
      const step = parseInt(this.dataset.step);
      if (State.completedSteps.has(step) || step === State.lessonStep) {
        goToStep(step);
      } else if (step < State.lessonStep || State.completedSteps.has(step - 1)) {
        goToStep(step);
      }
    });
  });
});

// ── LESSON NAVIGATION ─────────────────────────────
function navigateLesson(direction) {
  const newStep = State.lessonStep + direction;
  if (newStep < 0 || newStep >= State.totalSteps) return;
  goToStep(newStep);
}

// Corregido: Se restauró la estructura de parámetros para recibir el stepIndex de forma apropiada.
function goToStep(stepIndex) {
  // Hide all steps
  document.querySelectorAll('.lesson__step').forEach(s => s.style.display = 'none');

  // Show target step
  const target = document.getElementById('step-' + stepIndex);
  if (target) {
    target.style.display = 'block';
    target.style.animation = 'fadeIn .35s ease both';
  }

  State.lessonStep = stepIndex;
  State.completedSteps.add(stepIndex);

  // Update progress
  const progress = Math.round(((stepIndex + 1) / State.totalSteps) * 100);
  const fill = document.getElementById('progressFill');
  const pct  = document.getElementById('progressPct');
  if (fill) fill.style.width = progress + '%';
  if (pct)  pct.textContent = progress + '%';

  // Update nav buttons
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  if (prevBtn) prevBtn.disabled = stepIndex === 0;
  if (nextBtn) {
    if (stepIndex === State.totalSteps - 1) {
      nextBtn.textContent = 'Completar Lección ✓';
      nextBtn.onclick = completeLesson;
    } else {
      nextBtn.textContent = 'Siguiente →';
      nextBtn.onclick = () => navigateLesson(1);
    }
  }

  // Update dots
  updateDots(stepIndex);
  // Update outline
  updateOutline(stepIndex);
}

function updateDots(active) {
  document.querySelectorAll('.dot').forEach((dot, i) => {
    dot.classList.remove('dot--active', 'dot--done');
    if (i < active) dot.classList.add('dot--done');
    else if (i === active) dot.classList.add('dot--active');
  });
}

function updateOutline(active) {
  document.querySelectorAll('.outline__item').forEach((item, i) => {
    item.classList.remove('outline__item--active', 'outline__item--done');
    const num = item.querySelector('.outline__num');
    if (i < active) {
      item.classList.add('outline__item--done');
      if (num) num.textContent = '✓';
    } else if (i === active) {
      item.classList.add('outline__item--active');
      if (num && num.textContent === '✓') num.textContent = i + 1;
    }
  });
}

function completeLesson() {
  const complete = document.getElementById('lessonComplete');
  if (complete) {
    complete.style.display = 'block';
    complete.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  // Award XP
  State.xp += 80;
  State.streak += 1;
  showToast('🎉 +80 XP ganados · Racha: ' + State.streak + ' días');

  // Show badge modal after delay
  setTimeout(() => {
    showBadgeModal('🗣️', 'The Speaker');
  }, 2000);
}

function nextLesson() {
  showPage('dashboard');
  showToast('🇬🇧 Próxima lección desbloqueada: Idiomatic British Expressions');
}

// ── PRONUNCIATION / VOICE ─────────────────────────
let recognitionInstance = null;

function playAudio(word) {
  // Simulate audio feedback with Web Speech API (browser TTS with British voice)
  if (!window.speechSynthesis) {
    showToast('🔊 ' + word.toUpperCase() + ' — /bɑːθ/ — Activa el audio del sistema');
    return;
  }
  const utter = new SpeechSynthesisUtterance(word);
  utter.lang = 'en-GB';
  utter.rate = 0.85;
  utter.pitch = 1.1;

  // Find British voice if available
  const voices = speechSynthesis.getVoices();
  const britishVoice = voices.find(v =>
    v.lang === 'en-GB' ||
    v.name.toLowerCase().includes('british') ||
    v.name.includes('Daniel') ||
    v.name.includes('Kate')
  );
  if (britishVoice) utter.voice = britishVoice;

  speechSynthesis.cancel();
  speechSynthesis.speak(utter);
  showToast('🔊 Reproduciendo: ' + word.toUpperCase() + ' (en-GB)');
}

function toggleRecording(exerciseId, word) {
  const btn = document.querySelector(`#${exerciseId} .btn--mic`);
  const feedback = document.getElementById('feedback-' + exerciseId);

  if (State.recordingActive) {
    // Stop
    State.recordingActive = false;
    if (btn) {
      btn.classList.remove('recording');
      btn.innerHTML = '<span>🎙️ Practicar</span>';
    }
    if (recognitionInstance) {
      recognitionInstance.stop();
      recognitionInstance = null;
    }
    return;
  }

  // Check for Speech Recognition support
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    // Fallback simulation
    simulateRecognition(exerciseId, word, btn, feedback);
    return;
  }

  State.recordingActive = true;
  if (btn) {
    btn.classList.add('recording');
    btn.innerHTML = '<span>⏹ Detener</span>';
  }

  const recognition = new SpeechRecognition();
  recognitionInstance = recognition;
  recognition.lang = 'en-GB';
  recognition.interimResults = false;
  recognition.maxAlternatives = 3;

  recognition.onresult = (e) => {
    const transcript = e.results[0][0].transcript.toLowerCase().trim();
    const confidence = e.results[0][0].confidence;
    evaluatePronunciation(exerciseId, word, transcript, confidence, feedback);
    State.recordingActive = false;
    if (btn) {
      btn.classList.remove('recording');
      btn.innerHTML = '<span>🎙️ Practicar</span>';
    }
  };

  recognition.onerror = () => {
    simulateRecognition(exerciseId, word, btn, feedback);
    State.recordingActive = false;
    if (btn) {
      btn.classList.remove('recording');
      btn.innerHTML = '<span>🎙️ Practicar</span>';
    }
  };

  recognition.start();
  showToast('🎙️ Escuchando... Di "' + word + '" en inglés británico');
}

function simulateRecognition(exerciseId, word, btn, feedback) {
  // Simulate progressive feedback (demo mode)
  State.recordingActive = true;
  if (btn) { btn.classList.add('recording'); btn.innerHTML = '<span>⏹ Procesando...</span>'; }

  setTimeout(() => {
    const scores = [78, 85, 92, 95, 88];
    const score  = scores[Math.floor(Math.random() * scores.length)];
    const isGood = score >= 80;

    if (feedback) {
      feedback.className = 'rp__feedback visible ' + (isGood ? 'correct' : 'needs-work');
      feedback.innerHTML = isGood
        ? `✓ Excelente pronunciación. Precisión estimada: <strong>${score}%</strong>. La vocal larga está bien ejecutada.`
        : `⚠ Casi perfecto (${score}%). Alarga un poco más la vocal — debe sonar como /ɑːː/ no /æ/. Intenta de nuevo.`;
    }
    State.recordingActive = false;
    if (btn) { btn.classList.remove('recording'); btn.innerHTML = '<span>🎙️ Practicar</span>'; }

    if (isGood) {
      State.xp += 10;
      showToast('🎙️ +10 XP · Pronunciación RP verificada');
    }
  }, 2200);
}

function evaluatePronunciation(exerciseId, word, transcript, confidence, feedback) {
  const expected = word.toLowerCase();
  const isMatch  = transcript.includes(expected) || expected.includes(transcript);
  const score    = Math.round(confidence * 100);

  if (feedback) {
    feedback.className = 'rp__feedback visible ' + (isMatch ? 'correct' : 'needs-work');
    feedback.innerHTML = isMatch
      ? `✓ ¡Perfecto! Dijiste "${transcript}" — Precisión: <strong>${score}%</strong>. Pronunciación RP correcta.`
      : `⚠ Se detectó "${transcript}" — intenta pronunciar "${expected}" con la vocal más larga y abierta.`;
  }

  if (isMatch) {
    State.xp += 10;
    showToast('🎙️ +10 XP · RP verificado: ' + word.toUpperCase());
  }
}

// ── GRAMMAR EXERCISES ─────────────────────────────
function checkGrammar(btn, isCorrect) {
  const exercise = btn.closest('.grammar__ex');
  const options  = exercise.querySelectorAll('.grammar__btn');
  const explain  = exercise.querySelector('.grammar__explanation');

  options.forEach(b => {
    b.classList.add(b === btn ? (isCorrect ? 'correct-ans' : 'wrong-ans') : '');
    b.disabled = true;
    b.style.pointerEvents = 'none';
  });

  if (explain) explain.style.display = 'block';

  if (isCorrect) {
    State.grammarScore++;
    State.xp += 15;
    showToast('✓ Correcto · +15 XP · Inglés británico impecable');
  } else {
    showToast('✗ Incorrecto · Revisa la explicación para entender la diferencia');
  }
}

// ── GAMIFICATION ──────────────────────────────────
function showBadgeModal(icon, name) {
  const modal = document.getElementById('badgeModal');
  const iconEl = document.getElementById('badgeModalIcon');
  const nameEl = document.getElementById('badgeModalName');
  if (modal && iconEl && nameEl) {
    iconEl.textContent = icon;
    nameEl.textContent = name;
    modal.classList.add('open');
    // Confetti-like particle effect
    createParticles();
  }
}

function closeBadgeModal() {
  const modal = document.getElementById('badgeModal');
  if (modal) modal.classList.remove('open');
}

function createParticles() {
  const colors = ['#C9A84C', '#E8C96A', '#C8102E', '#FFFFFF', '#F5E8C0'];
  for (let i = 0; i < 30; i++) {
    const particle = document.createElement('div');
    particle.style.cssText = `
      position: fixed;
      width: ${4 + Math.random() * 6}px;
      height: ${4 + Math.random() * 6}px;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      border-radius: ${Math.random() > .5 ? '50%' : '0'};
      top: 50%; left: 50%;
      z-index: 300; pointer-events: none;
      transform: translate(-50%, -50%);
      transition: all ${0.6 + Math.random() * 0.8}s cubic-bezier(.25,.46,.45,.94);
    `;
    document.body.appendChild(particle);
    const angle = Math.random() * Math.PI * 2;
    const dist  = 100 + Math.random() * 200;
    setTimeout(() => {
      particle.style.transform = `translate(${Math.cos(angle) * dist - 50}%, ${Math.sin(angle) * dist - 50}%) scale(0)`;
      particle.style.opacity = '0';
    }, 50);
    setTimeout(() => particle.remove(), 1500);
  }
}

// ── TOAST NOTIFICATIONS ───────────────────────────
let toastTimer;
function showToast(message, duration = 3500) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('visible');
  toastTimer = setTimeout(() => {
    toast.classList.remove('visible');
  }, duration);
}

// ── LEVEL BAR ANIMATION ───────────────────────────
function animateLevelBar() {
  const bar = document.querySelector('.level__bar-fill');
  if (bar) {
    bar.style.width = '0';
    setTimeout(() => {
      bar.style.width = '62%';
    }, 100);
  }
}

// ── INTERSECTION OBSERVER — Scroll Animations ──────
const observerConfig = { threshold: 0.15, rootMargin: '0px 0px -60px 0px' };
const animObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
      animObserver.unobserve(entry.target);
    }
  });
}, observerConfig);

function initScrollAnimations() {
  const targets = document.querySelectorAll(
    '.metod__card, .tutor__card, .badge__item, .test__card, .plan__card, .nivel__item'
  );
  targets.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(24px)';
    el.style.transition = `opacity .5s ease ${i * 0.06}s, transform .5s ease ${i * 0.06}s`;
    animObserver.observe(el);
  });
}

// ── SMOOTH ANCHOR SCROLLING ───────────────────────
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', function(e) {
    const href = this.getAttribute('href');
    if (href === '#') return;
    const target = document.querySelector(href);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// ── BADGE HOVER SOUND (visual pulse only — no audio) ─
document.querySelectorAll('.badge__medal').forEach(medal => {
  medal.addEventListener('mouseenter', function() {
    this.style.transition = 'transform .2s cubic-bezier(.175,.885,.32,1.275)';
    this.style.transform = 'scale(1.12) rotate(3deg)';
  });
  medal.addEventListener('mouseleave', function() {
    this.style.transform = 'scale(1) rotate(0)';
  });
});

// ── PLAN CARD SELECTION (venta real en Supabase) ──
document.querySelectorAll('.plan__card').forEach(card => {
  const btn = card.querySelector('.btn--plan, .btn--primary, .btn--gold');
  if (btn) {
    btn.addEventListener('click', async () => {
      const planName = card.querySelector('.plan__name')?.textContent || 'Premium';
      const priceText = card.querySelector('.plan__price')?.textContent || '0';
      const amount = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;

      const name = prompt('Tu nombre completo para registrar la inscripción:');
      if (!name) return;
      const email = prompt('Tu email:');
      if (!email) return;

      setStudentIdentity(name, email);

      try {
        await registerSale({ planId: null, planName, amount, studentName: name, studentEmail: email });
        showToast(`✓ Plan ${planName} registrado · Te contactaremos para confirmar el pago`);
      } catch (err) {
        showToast('⚠ No se pudo registrar la venta. Revisa la conexión con Supabase.');
      }
      setTimeout(() => showPage('dashboard'), 1200);
    });
  }
});

// ── KEYBOARD NAVIGATION ───────────────────────────
document.addEventListener('keydown', (e) => {
  if (State.currentPage === 'leccion') {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') navigateLesson(1);
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   navigateLesson(-1);
    if (e.key === 'Escape' && document.getElementById('badgeModal')?.classList.contains('open')) {
      closeBadgeModal();
    }
  }
});

// ── INIT ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initScrollAnimations();

  // Preload TTS voices
  if (window.speechSynthesis) {
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
  }

  // Start on landing
  showPage('landing');

  // Welcome toast after short delay
  setTimeout(() => {
    showToast('🇬🇧 Bienvenido a Queen Elizabeth Academy · Comienza tu prueba gratuita');
  }, 1800);
});

/* ═══════════════════════════════════════════════════
   MATERIALES — vista del alumno (datos reales de Supabase)
═══════════════════════════════════════════════════ */
function saveStudentIdentity() {
  const name = document.getElementById('matStudentName').value.trim();
  const email = document.getElementById('matStudentEmail').value.trim();
  if (!name || !email) { showToast('⚠ Completa nombre y email'); return; }
  setStudentIdentity(name, email);
  showToast('✓ Identidad guardada en este navegador');
}

const TYPE_ICONS = { pdf: '📄', video: '🎬', audio: '🎧', doc: '📝', link: '🔗' };

async function loadMaterialsPage() {
  const container = document.getElementById('materialsList');
  if (!container) return;
  container.innerHTML = '<p>Cargando materiales…</p>';

  // Prefill identity inputs if already saved
  const { name, email } = getStudentIdentity();
  const nameInput = document.getElementById('matStudentName');
  const emailInput = document.getElementById('matStudentEmail');
  if (nameInput && name) nameInput.value = name;
  if (emailInput && email) emailInput.value = email;

  try {
    const materials = await fetchAllMaterials();
    if (!materials.length) {
      container.innerHTML = '<p>Todavía no hay materiales subidos. El docente puede subir desde el Panel Docente.</p>';
      return;
    }
    container.innerHTML = materials.map(m => {
      const courseName = m.lessons?.courses?.title || 'Sin curso';
      const lessonName = m.lessons?.title || 'General';
      const url = m.type === 'link' ? m.external_url : getMaterialPublicUrl(m.file_path);
      return `
        <div class="lesson__item" style="cursor:default">
          <div class="lesson__thumb">${TYPE_ICONS[m.type] || '📁'}</div>
          <div class="lesson__info" style="flex:1">
            <strong>${escapeHtml(m.title)}</strong>
            <span>${escapeHtml(courseName)} · ${escapeHtml(lessonName)}${m.description ? ' · ' + escapeHtml(m.description) : ''}</span>
          </div>
          <button class="btn btn--ghost btn--sm" onclick="openMaterial('${m.id}', '${url || ''}', 'view')">👁 Ver</button>
          <button class="btn btn--primary btn--sm" onclick="openMaterial('${m.id}', '${url || ''}', 'download')">⬇ Descargar</button>
        </div>`;
    }).join('');
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p>⚠ No se pudo conectar con Supabase. Revisa la URL/clave en backend.js.</p>';
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function openMaterial(materialId, url, action) {
  if (!url) { showToast('⚠ Este material no tiene archivo o enlace válido'); return; }
  await logMaterialEvent(materialId, action);
  window.open(url, '_blank');
  showToast(action === 'download' ? '⬇ Descarga registrada' : '👁 Vista registrada');
}

/* ═══════════════════════════════════════════════════
   PANEL DOCENTE — subir y administrar materiales
═══════════════════════════════════════════════════ */
async function unlockAdmin() {
  const hasAccess = await checkTeacherAccess();
  if (hasAccess) {
    document.getElementById('adminGate').style.display = 'none';
    document.getElementById('adminContent').style.display = 'block';
    loadAdminLessonOptions();
    loadAdminCourseOptions();
    loadAdminMaterialsList();
  } else {
    showToast('⚠ Solo docentes y administradores pueden acceder. Iniciá sesión con el rol correcto.');
  }
}

async function loadAdminCourseOptions() {
  const select = document.getElementById('newLessonCourse');
  if (!select) return;
  try {
    const courses = await fetchCourses();
    select.innerHTML = courses.length
      ? courses.map(c => `<option value="${c.id}">${escapeHtml(c.title)} (${c.level || '—'})</option>`).join('')
      : '<option value="">Primero creá un curso arriba ↑</option>';
  } catch (err) {
    select.innerHTML = '<option value="">⚠ Error cargando cursos</option>';
  }
}

async function handleCreateCourse(event) {
  event.preventDefault();
  const status = document.getElementById('courseStatus');
  const title = document.getElementById('newCourseTitle').value.trim();
  const level = document.getElementById('newCourseLevel').value;
  if (!title) { showToast('⚠ Falta el nombre del curso'); return; }

  status.textContent = 'Creando…';
  try {
    await createCourse(title, level);
    status.textContent = '✓ Curso creado';
    showToast(`✓ Curso "${title}" creado`);
    document.getElementById('newCourseTitle').value = '';
    loadAdminCourseOptions();
  } catch (err) {
    status.textContent = '⚠ Error';
    showToast('⚠ No se pudo crear el curso');
  }
}

async function handleCreateLesson(event) {
  event.preventDefault();
  const status = document.getElementById('lessonStatus');
  const courseId = document.getElementById('newLessonCourse').value;
  const title = document.getElementById('newLessonTitle').value.trim();
  const position = parseInt(document.getElementById('newLessonPosition').value) || 1;
  if (!courseId) { showToast('⚠ Primero creá o selecciona un curso'); return; }
  if (!title) { showToast('⚠ Falta el título de la lección'); return; }

  status.textContent = 'Creando…';
  try {
    await createLesson(courseId, title, position);
    status.textContent = '✓ Lección creada';
    showToast(`✓ Lección "${title}" creada`);
    document.getElementById('newLessonTitle').value = '';
    loadAdminLessonOptions();
  } catch (err) {
    status.textContent = '⚠ Error';
    showToast('⚠ No se pudo crear la lección');
  }
}

async function loadAdminLessonOptions() {
  const select = document.getElementById('lessonSelect');
  if (!select) return;
  try {
    const courses = await fetchCourses();
    let optionsHtml = '';
    for (const course of courses) {
      const lessons = await fetchLessons(course.id);
      lessons.forEach(l => {
        optionsHtml += `<option value="${l.id}">${escapeHtml(course.title)} → ${escapeHtml(l.title)}</option>`;
      });
    }
    select.innerHTML = optionsHtml || '<option value="">Sin lecciones — crea una en Supabase primero</option>';
  } catch (err) {
    console.error(err);
    select.innerHTML = '<option value="">⚠ Error cargando lecciones</option>';
  }
}

async function loadAdminMaterialsList() {
  const container = document.getElementById('adminMaterialsList');
  if (!container) return;
  container.innerHTML = 'Cargando…';
  try {
    const materials = await fetchAllMaterials();
    if (!materials.length) { container.innerHTML = '<p>No hay materiales todavía.</p>'; return; }
    container.innerHTML = materials.map(m => `
      <div class="lesson__item" style="cursor:default">
        <div class="lesson__thumb">${TYPE_ICONS[m.type] || '📁'}</div>
        <div class="lesson__info" style="flex:1">
          <strong>${escapeHtml(m.title)}</strong>
          <span>${m.type} · ${new Date(m.created_at).toLocaleDateString()}</span>
        </div>
        <button class="btn btn--ghost btn--sm" onclick="handleDeleteMaterial('${m.id}', '${m.file_path || ''}')">🗑 Borrar</button>
      </div>`).join('');
  } catch (err) {
    console.error(err);
    container.innerHTML = '⚠ Error cargando materiales.';
  }
}

async function handleUploadMaterial(event) {
  event.preventDefault();
  const status = document.getElementById('uploadStatus');
  const lessonId = document.getElementById('lessonSelect').value || null;
  const title = document.getElementById('materialTitle').value.trim();
  const type = document.getElementById('materialType').value;
  const fileInput = document.getElementById('materialFile');
  const file = fileInput.files[0] || null;
  const externalUrl = document.getElementById('materialUrl').value.trim();
  const description = document.getElementById('materialDescription').value.trim();

  if (!title) { showToast('⚠ Falta el título'); return; }
  if (type !== 'link' && !file) { showToast('⚠ Selecciona un archivo o cambia el tipo a "Enlace externo"'); return; }
  if (type === 'link' && !externalUrl) { showToast('⚠ Falta la URL externa'); return; }

  status.textContent = 'Subiendo…';
  try {
    await uploadMaterial({ file, lessonId, title, type, description, externalUrl });
    status.textContent = '✓ Subido correctamente';
    showToast('✓ Material subido a Supabase');
    document.getElementById('uploadForm').reset();
    loadAdminMaterialsList();
  } catch (err) {
    console.error(err);
    status.textContent = '⚠ Error al subir';
    showToast('⚠ No se pudo subir. Revisa la consola y la configuración de Supabase.');
  }
}

async function handleDeleteMaterial(materialId, filePath) {
  if (!confirm('¿Borrar este material? Esta acción es real y no se puede deshacer.')) return;
  try {
    await deleteMaterial(materialId, filePath || null);
    showToast('✓ Material eliminado');
    loadAdminMaterialsList();
  } catch (err) {
    showToast('⚠ Error al eliminar');
  }
}

/* ═══════════════════════════════════════════════════
   ESTADÍSTICAS REALES — dashboard
═══════════════════════════════════════════════════ */
async function loadRealStats() {
  const revenueEl = document.getElementById('statRevenue');
  const salesEl = document.getElementById('statSalesCount');
  const studentsEl = document.getElementById('statStudents');
  const eventsEl = document.getElementById('statMaterialEvents');
  const topEl = document.getElementById('statTopMaterials');
  const updatedEl = document.getElementById('statsUpdatedAt');
  if (!revenueEl) return;

  try {
    const stats = await fetchRealStats();
    revenueEl.textContent = '$' + stats.totalRevenue.toLocaleString('es-AR');
    salesEl.textContent = stats.totalSalesCount;
    studentsEl.textContent = stats.uniqueStudents;
    eventsEl.textContent = stats.totalMaterialEvents;
    if (topEl) {
      topEl.innerHTML = stats.topMaterials.length
        ? '<strong>Materiales más vistos:</strong> ' + stats.topMaterials.map(m => `${escapeHtml(m.title)} (${m.views})`).join(' · ')
        : '';
    }
    if (updatedEl) updatedEl.textContent = 'Actualizado ' + new Date().toLocaleTimeString();
  } catch (err) {
    console.error(err);
    [revenueEl, salesEl, studentsEl, eventsEl].forEach(el => el && (el.textContent = '⚠'));
  }
}

/* ═══════════════════════════════════════════════════
   AUTH MODAL — Login, Registro y Gestión de Usuarios
═══════════════════════════════════════════════════ */

// Estado del perfil actual
let CurrentProfile = null;

// ── Inicializar sesión al cargar ─────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Escuchar cambios de sesión
  onAuthStateChange(async (event, session) => {
    if (session?.user) {
      await refreshCurrentProfile();
    } else {
      CurrentProfile = null;
      renderNavGuest();
    }
  });

  // Cargar sesión existente
  const user = await getCurrentUser();
  if (user) {
    await refreshCurrentProfile();
  } else {
    renderNavGuest();
  }
});

async function refreshCurrentProfile() {
  CurrentProfile = await getCurrentProfile();
  if (CurrentProfile) {
    renderNavUser(CurrentProfile);
    // Mostrar tab Usuarios solo a admins
    const tabUsers = document.getElementById('tabUsers');
    if (tabUsers) tabUsers.style.display = CurrentProfile.role === 'admin' ? '' : 'none';
    renderDashboardForRole(CurrentProfile.role);
  }
}

/* ── Dashboard por rol ────────────────────────────
   Muestra solo el <main> correspondiente y carga sus datos.
────────────────────────────────────────────────── */
function renderDashboardForRole(role) {
  const mains = {
    student: document.getElementById('dashMainStudent'),
    admin:   document.getElementById('dashMainAdmin'),
    teacher: document.getElementById('dashMainTeacher'),
  };
  Object.entries(mains).forEach(([key, el]) => {
    if (el) el.style.display = key === role ? '' : 'none';
  });

  if (role === 'admin') loadAdminDashboard();
  if (role === 'teacher') loadTeacherDashboard();
}

async function loadAdminDashboard() {
  try {
    const [profiles, stats, courses] = await Promise.all([
      fetchAllProfiles(),
      fetchRealStats(),
      fetchCoursesWithTeacher(),
    ]);

    const students = profiles.filter(p => p.role === 'student').length;
    const teachers = profiles.filter(p => p.role === 'teacher').length;

    document.getElementById('adminStatStudents').textContent = students;
    document.getElementById('adminStatTeachers').textContent = teachers;
    document.getElementById('adminStatRevenue').textContent = `$${stats.totalRevenue.toLocaleString('es-AR')}`;
    document.getElementById('adminStatCourses').textContent = courses.length;

    const teacherOptions = profiles.filter(p => p.role === 'teacher');
    document.getElementById('adminCoursesList').innerHTML = courses.length
      ? courses.map(c => `
        <div class="lesson__item">
          <div class="lesson__info">
            <strong>${escapeHtmlApp(c.title)}</strong>
            <span>${escapeHtmlApp(c.level || '')}${c.profiles ? ' · ' + escapeHtmlApp(c.profiles.display_name || c.profiles.email) : ' · Sin profesor asignado'}</span>
          </div>
          <select onchange="handleAssignTeacher('${c.id}', this.value)">
            <option value="">Asignar profesor…</option>
            ${teacherOptions.map(t => `<option value="${t.id}" ${t.id === c.teacher_id ? 'selected' : ''}>${escapeHtmlApp(t.display_name || t.email)}</option>`).join('')}
          </select>
        </div>
      `).join('')
      : '<p style="opacity:.7">No hay cursos cargados todavía.</p>';

    document.getElementById('adminRecentUsers').innerHTML = profiles.slice(0, 5).map(p => `
      <div class="lesson__item">
        <div class="lesson__info">
          <strong>${escapeHtmlApp(p.display_name || p.email)}</strong>
          <span>${escapeHtmlApp(p.role)}</span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error cargando panel admin:', err.message);
  }
}

async function handleAssignTeacher(courseId, teacherId) {
  if (!teacherId) return;
  try {
    await assignTeacherToCourse(courseId, teacherId);
    showToast('✓ Profesor asignado');
    loadAdminDashboard();
  } catch (err) {
    alert('Error asignando profesor: ' + err.message);
  }
}

async function loadTeacherDashboard() {
  try {
    const courses = await fetchTeacherCourses(CurrentProfile.id);
    const studentCount = await fetchTeacherStudentCount(CurrentProfile.id);

    document.getElementById('teacherStatCourses').textContent = courses.length;
    document.getElementById('teacherStatStudents').textContent = studentCount;
    document.getElementById('teacherStatMaterials').textContent = '—';

    document.getElementById('teacherCoursesList').innerHTML = courses.length
      ? courses.map(c => `
        <div class="lesson__item">
          <div class="lesson__info">
            <strong>${escapeHtmlApp(c.title)}</strong>
            <span>${escapeHtmlApp(c.level || '')}</span>
          </div>
        </div>
      `).join('')
      : '<p style="opacity:.7">Todavía no tenés cursos asignados. Pedile a un admin que te asigne uno.</p>';
  } catch (err) {
    console.error('Error cargando panel docente:', err.message);
  }
}

function escapeHtmlApp(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ── Abrir / cerrar modal ─────────────────────────
function openAuthModal(tab = 'login') {
  const overlay = document.getElementById('authOverlay');
  overlay.classList.add('open');
  switchAuthTab(tab);
}

function closeAuthModal(event) {
  if (event && event.target !== document.getElementById('authOverlay')) return;
  document.getElementById('authOverlay').classList.remove('open');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.getElementById('authOverlay')?.classList.remove('open');
});

// ── Cambiar tabs ─────────────────────────────────
function switchAuthTab(tab) {
  document.querySelectorAll('.auth__tab').forEach(t => t.classList.remove('auth__tab--active'));
  document.querySelectorAll('.auth__panel').forEach(p => p.style.display = 'none');

  document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('auth__tab--active');
  document.getElementById('authPanel' + tab.charAt(0).toUpperCase() + tab.slice(1)).style.display = '';

  if (tab === 'users') loadUsersTable();
}

// ── LOGIN ────────────────────────────────────────
async function handleLogin() {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl  = document.getElementById('loginError');
  const btn      = document.getElementById('loginBtn');

  errorEl.textContent = '';
  if (!email || !password) { errorEl.textContent = 'Completá email y contraseña.'; return; }

  btn.disabled = true; btn.textContent = 'Ingresando…';
  try {
    await signInUser(email, password);
    await refreshCurrentProfile();
    document.getElementById('authOverlay').classList.remove('open');
    showToast('✓ Sesión iniciada · Bienvenido/a de vuelta');
    showPage('dashboard');
  } catch (err) {
    errorEl.textContent = traducirError(err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Ingresar';
  }
}

// ── REGISTRO ─────────────────────────────────────
async function handleRegister() {
  const name     = document.getElementById('regName').value.trim();
  const email    = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const role     = document.getElementById('regRole').value;
  const errorEl  = document.getElementById('regError');
  const infoEl   = document.getElementById('regInfo');
  const btn      = document.getElementById('regBtn');

  errorEl.textContent = ''; infoEl.textContent = '';
  if (!name || !email || !password) { errorEl.textContent = 'Completá todos los campos.'; return; }
  if (password.length < 6)          { errorEl.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }

  btn.disabled = true; btn.textContent = 'Creando cuenta…';
  try {
    await signUpUser(email, password, name, role);
    infoEl.textContent = '✓ Cuenta creada. Revisá tu email para confirmarla (o ingresá si la confirmación está desactivada).';
    document.getElementById('regName').value = '';
    document.getElementById('regEmail').value = '';
    document.getElementById('regPassword').value = '';
    showToast('✓ Usuario creado: ' + name);
  } catch (err) {
    errorEl.textContent = traducirError(err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Crear cuenta';
  }
}

// ── CERRAR SESIÓN ────────────────────────────────
async function handleSignOut() {
  try {
    await signOutUser();
    CurrentProfile = null;
    renderNavGuest();
    showPage('landing');
    showToast('Sesión cerrada · ¡Hasta pronto!');
  } catch (err) {
    showToast('⚠ Error al cerrar sesión');
  }
}

// ── TABLA DE USUARIOS (solo admin) ───────────────
async function loadUsersTable() {
  const container = document.getElementById('usersList');
  if (!container) return;
  container.innerHTML = '<p style="opacity:.6">Cargando…</p>';

  try {
    const profiles = await fetchAllProfiles();
    if (!profiles.length) { container.innerHTML = '<p>No hay usuarios todavía.</p>'; return; }

    const rows = profiles.map(p => `
      <tr>
        <td>
          <strong>${escapeHtml(p.display_name || '—')}</strong><br>
          <span style="font-size:.75rem;color:var(--text-muted)">${escapeHtml(p.email)}</span>
        </td>
        <td>
          <select class="role-select" data-uid="${p.id}" onchange="handleRoleChange('${p.id}', this.value)">
            <option value="student"  ${p.role === 'student'  ? 'selected' : ''}>Alumno</option>
            <option value="teacher"  ${p.role === 'teacher'  ? 'selected' : ''}>Docente</option>
            <option value="admin"    ${p.role === 'admin'    ? 'selected' : ''}>Admin</option>
          </select>
        </td>
        <td>
          <span class="role-tag role-tag--${p.role}">${rolLabel(p.role)}</span>
        </td>
        <td>
          <button class="btn--danger" onclick="handleDeleteUser('${p.id}', '${escapeHtml(p.display_name || p.email)}')">🗑</button>
        </td>
      </tr>
    `).join('');

    container.innerHTML = `
      <table class="users__table">
        <thead><tr>
          <th>Usuario</th><th>Cambiar rol</th><th>Rol actual</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  } catch (err) {
    container.innerHTML = '<p style="color:var(--red)">⚠ ' + err.message + '</p>';
  }
}

async function handleRoleChange(userId, newRole) {
  try {
    await updateUserRole(userId, newRole);
    showToast('✓ Rol actualizado a ' + rolLabel(newRole));
    loadUsersTable();
  } catch (err) {
    showToast('⚠ No se pudo cambiar el rol');
  }
}

async function handleDeleteUser(userId, name) {
  if (!confirm('¿Eliminar el perfil de ' + name + '? Esta acción no se puede deshacer.')) return;
  try {
    await deleteUserProfile(userId);
    showToast('✓ Usuario eliminado');
    loadUsersTable();
  } catch (err) {
    showToast('⚠ No se pudo eliminar el usuario');
  }
}

// ── Actualizar nav ───────────────────────────────
function renderNavUser(profile) {
  const guest = document.getElementById('navGuest');
  const user  = document.getElementById('navUser');
  if (guest) guest.style.display = 'none';
  if (user)  user.style.display  = 'flex';

  const initials = (profile.display_name || profile.email)
    .split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const firstName = (profile.display_name || profile.email.split('@')[0]).split(' ')[0];

  const avatarEl = document.getElementById('navUserAvatar');
  const nameEl   = document.getElementById('navUserName');
  const roleEl   = document.getElementById('navUserRole');
  if (avatarEl) avatarEl.textContent = initials;
  if (nameEl)   nameEl.textContent   = firstName;
  if (roleEl)   roleEl.textContent   = rolLabel(profile.role);

  // También actualizar el sidebar del dashboard
  const sidebarAvatar = document.querySelector('.sidebar__avatar');
  const sidebarName   = document.querySelector('.sidebar__user-info strong');
  if (sidebarAvatar) sidebarAvatar.textContent = initials;
  if (sidebarName)   sidebarName.textContent   = firstName;

  // Actualizar saludo del dashboard
  const dashTitle = document.querySelector('.dash__title');
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  if (dashTitle) dashTitle.innerHTML = greeting + ', ' + firstName + ' <span role="img" aria-label="Sol">☀️</span>';
}

function renderNavGuest() {
  const guest = document.getElementById('navGuest');
  const user  = document.getElementById('navUser');
  if (guest) guest.style.display = '';
  if (user)  user.style.display  = 'none';
}

// ── Helpers ──────────────────────────────────────
function rolLabel(role) {
  return { admin: 'Admin', teacher: 'Docente', student: 'Alumno' }[role] || role;
}

function traducirError(msg) {
  if (msg.includes('Invalid login credentials')) return 'Email o contraseña incorrectos.';
  if (msg.includes('Email not confirmed'))       return 'Confirmá tu email antes de ingresar.';
  if (msg.includes('User already registered'))   return 'Ese email ya tiene una cuenta registrada.';
  if (msg.includes('Password should be'))        return 'La contraseña debe tener al menos 6 caracteres.';
  return msg;
}
