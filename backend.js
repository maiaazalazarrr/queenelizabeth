/* ═══════════════════════════════════════════════════
   QUEEN ELIZABETH ACADEMY — backend.js
   Conexión real a Supabase: Auth, Roles, Materiales y Métricas.
═══════════════════════════════════════════════════ */

"use strict";

const SUPABASE_URL     = "https://nuqvqeynhssipmcmebxb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_WjBgPoBpB1ONRrQh_JSucA_X_cCiDZY";

const supabaseClient   = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const MATERIALS_BUCKET = "materials";

/* ──────────────────────────────────────────────────
   AUTH — REGISTRO E INICIO DE SESIÓN
────────────────────────────────────────────────── */

/**
 * Registra un nuevo usuario y crea su perfil con el rol indicado.
 * role: 'student' | 'teacher' | 'admin'
 */
async function signUpUser(email, password, displayName, role = 'student') {
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName, role } }
  });
  if (error) throw error;
  // La fila en `profiles` la crea automáticamente el trigger
  // on_auth_user_created (ver supabase_setup_v2.sql), usando
  // display_name y role de los metadatos que mandamos arriba.
  return data;
}

/**
 * Inicia sesión con email y contraseña.
 */
async function signInUser(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

/**
 * Cierra la sesión activa.
 */
async function signOutUser() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) throw error;
}

/**
 * Obtiene el usuario autenticado o null.
 */
async function getCurrentUser() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  return user;
}

/**
 * Obtiene el perfil completo (con rol) del usuario autenticado.
 */
async function getCurrentProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  if (error) return null;
  return data;
}

/**
 * Escucha cambios de sesión en tiempo real.
 */
function onAuthStateChange(callback) {
  supabaseClient.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}

/* ──────────────────────────────────────────────────
   GESTIÓN DE USUARIOS (solo admin/teacher)
────────────────────────────────────────────────── */

/**
 * Lista todos los perfiles. Requiere que RLS lo permita para el rol actual.
 */
async function fetchAllProfiles() {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('id, email, display_name, role, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Actualiza el rol de un usuario (solo admin).
 */
async function updateUserRole(userId, newRole) {
  const { error } = await supabaseClient
    .from('profiles')
    .update({ role: newRole })
    .eq('id', userId);
  if (error) throw error;
}

/**
 * Elimina el perfil de un usuario (solo admin).
 * Nota: el usuario en Auth queda; desde Supabase Dashboard se puede borrar también.
 */
async function deleteUserProfile(userId) {
  const { error } = await supabaseClient
    .from('profiles')
    .delete()
    .eq('id', userId);
  if (error) throw error;
}

/* ──────────────────────────────────────────────────
   CONTROLA ACCESO AL PANEL DOCENTE
   Ahora usa la tabla profiles en vez de una lista hardcodeada
────────────────────────────────────────────────── */

async function checkTeacherAccess() {
  const profile = await getCurrentProfile();
  return profile && (profile.role === 'teacher' || profile.role === 'admin');
}

/* ──────────────────────────────────────────────────
   MATERIALES — VISTA DEL ALUMNO
────────────────────────────────────────────────── */

async function fetchAllMaterials() {
  const { data, error } = await supabaseClient
    .from("materials")
    .select(`
      id, title, type, description, file_path, external_url, created_at,
      lessons ( id, title, courses ( id, title, level ) )
    `)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

function getMaterialPublicUrl(filePath) {
  if (!filePath) return null;
  const { data } = supabaseClient.storage.from(MATERIALS_BUCKET).getPublicUrl(filePath);
  return data?.publicUrl || null;
}

async function logMaterialEvent(materialId, action = "view") {
  const user = await getCurrentUser();
  const { error } = await supabaseClient
    .from("material_events")
    .insert([{
      material_id: materialId,
      action,
      student_id:    user?.id || null,
      student_name:  user?.email ? user.email.split('@')[0] : "Usuario",
      student_email: user?.email || "anonimo@academy.com"
    }]);
  if (error) console.error("Error al registrar evento:", error);
}

/* ──────────────────────────────────────────────────
   OPERACIONES DEL PANEL DOCENTE
────────────────────────────────────────────────── */

async function fetchCourses() {
  const { data, error } = await supabaseClient.from("courses").select("*").order("title");
  if (error) throw error;
  return data || [];
}

async function createCourse(title, level, extra = {}) {
  const { age_group = null, sublevel = null, teacher_id = null } = extra;
  const { data, error } = await supabaseClient
    .from("courses")
    .insert([{ title, level, age_group, sublevel, teacher_id }])
    .select();
  if (error) throw error;
  return data;
}

async function fetchLessons(courseId) {
  const { data, error } = await supabaseClient
    .from("lessons").select("*").eq("course_id", courseId).order("position");
  if (error) throw error;
  return data || [];
}

async function createLesson(courseId, title, position = 1) {
  const { data, error } = await supabaseClient
    .from("lessons").insert([{ course_id: courseId, title, position }]).select();
  if (error) throw error;
  return data;
}

async function uploadMaterial({ file, lessonId, title, type, description, externalUrl }) {
  let filePath = null;
  if (file && type !== "link") {
    const fileExt = file.name.split(".").pop();
    const cleanName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
    const { data: storageData, error: storageError } = await supabaseClient.storage
      .from(MATERIALS_BUCKET).upload(cleanName, file);
    if (storageError) throw storageError;
    filePath = storageData.path;
  }
  const { data, error } = await supabaseClient.from("materials").insert([{
    lesson_id: lessonId, title, type, description,
    file_path: filePath,
    external_url: type === "link" ? externalUrl : null
  }]).select();
  if (error) throw error;
  return data;
}

async function deleteMaterial(materialId, filePath = null) {
  const { error: dbError } = await supabaseClient.from("materials").delete().eq("id", materialId);
  if (dbError) throw dbError;
  if (filePath) {
    const { error: storageError } = await supabaseClient.storage
      .from(MATERIALS_BUCKET).remove([filePath]);
    if (storageError) console.error("Aviso Storage:", storageError.message);
  }
}

/* ──────────────────────────────────────────────────
   CURSOS POR PROFESOR / INSCRIPCIONES
   Requiere migración: courses.teacher_id + tabla enrollments
────────────────────────────────────────────────── */

async function fetchTeacherCourses(teacherId) {
  const { data, error } = await supabaseClient
    .from("courses")
    .select("*")
    .eq("teacher_id", teacherId)
    .order("title");
  if (error) throw error;
  return data || [];
}

async function assignTeacherToCourse(courseId, teacherId) {
  const { error } = await supabaseClient
    .from("courses")
    .update({ teacher_id: teacherId })
    .eq("id", courseId);
  if (error) throw error;
}

async function fetchCoursesWithTeacher() {
  const { data, error } = await supabaseClient
    .from("courses")
    .select("id, title, level, teacher_id, profiles:teacher_id ( display_name, email )")
    .order("title");
  if (error) throw error;
  return data || [];
}

async function enrollStudent(studentId, courseId) {
  const { error } = await supabaseClient
    .from("enrollments")
    .insert([{ student_id: studentId, course_id: courseId }]);
  if (error) throw error;
}

async function fetchCourseStudents(courseId) {
  const { data, error } = await supabaseClient
    .from("enrollments")
    .select("student_id, profiles:student_id ( id, display_name, email )")
    .eq("course_id", courseId);
  if (error) throw error;
  return (data || []).map(e => e.profiles).filter(Boolean);
}

/**
 * Alias usado por el dashboard docente (app.js): cursos asignados a un profesor.
 */
async function fetchCoursesForTeacher(teacherId) {
  return fetchTeacherCourses(teacherId);
}

/**
 * Todos los cursos, agrupados por age_group → level, para el panel de admin.
 * Devuelve algo como: { starter: { A1: [...], A2: [...] }, sin_asignar: { ... } }
 */
async function fetchAllCoursesGrouped() {
  const { data, error } = await supabaseClient
    .from("courses")
    .select("*")
    .order("title");
  if (error) throw error;

  const grouped = {};
  (data || []).forEach(course => {
    const ageKey = course.age_group || "sin_asignar";
    const levelKey = course.level || "Sin nivel";
    if (!grouped[ageKey]) grouped[ageKey] = {};
    if (!grouped[ageKey][levelKey]) grouped[ageKey][levelKey] = [];
    grouped[ageKey][levelKey].push(course);
  });
  return grouped;
}

/**
 * Cuenta perfiles por rol (para las tarjetas del panel de admin).
 */
async function fetchProfileCountsByRole() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("role");
  if (error) throw error;

  const counts = { student: 0, teacher: 0, admin: 0 };
  (data || []).forEach(p => {
    if (counts[p.role] !== undefined) counts[p.role]++;
  });
  return counts;
}

async function fetchTeacherStudentCount(teacherId) {
  const courses = await fetchTeacherCourses(teacherId);
  if (!courses.length) return 0;
  const { data, error } = await supabaseClient
    .from("enrollments")
    .select("student_id", { count: "exact", head: false })
    .in("course_id", courses.map(c => c.id));
  if (error) throw error;
  return new Set((data || []).map(e => e.student_id)).size;
}

/* ──────────────────────────────────────────────────
   PASARELA DE VENTAS
────────────────────────────────────────────────── */

async function registerSale({ planId, planName, amount, studentName, studentEmail }) {
  const { data, error } = await supabaseClient.from("sales").insert([{
    plan_id: planId, plan_name: planName, amount,
    student_name: studentName, student_email: studentEmail, status: "pagado"
  }]).select();
  if (error) throw error;
  return data;
}

/**
 * Trae todas las ventas para el panel de Gestión Comercial (solo admin).
 */
async function fetchAllSales() {
  const { data, error } = await supabaseClient
    .from("sales")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Actualiza el estado de una venta: 'pendiente' | 'pagado' | 'cancelado'.
 * Requiere la policy "actualizar ventas" (UPDATE) en la tabla sales.
 */
async function updateSaleStatus(saleId, status) {
  const { error } = await supabaseClient
    .from("sales")
    .update({ status })
    .eq("id", saleId);
  if (error) throw error;
}

/* ──────────────────────────────────────────────────
   ESTADÍSTICAS
────────────────────────────────────────────────── */

async function fetchRealStats() {
  const [salesRes, eventsRes, materialsRes] = await Promise.all([
    supabaseClient.from("sales").select("amount, status, student_email"),
    supabaseClient.from("material_events").select("material_id, action, student_email, created_at"),
    supabaseClient.from("materials").select("id, title"),
  ]);

  const sales     = salesRes.data     || [];
  const events    = eventsRes.data    || [];
  const materials = materialsRes.data || [];

  const totalRevenue   = sales.filter(s => s.status === "pagado").reduce((sum, s) => sum + Number(s.amount), 0);
  const totalSalesCount = sales.length;
  const uniqueStudents  = new Set([...sales.map(s => s.student_email), ...events.map(e => e.student_email)].filter(Boolean)).size;

  const viewsByMaterial = {};
  events.forEach(e => { viewsByMaterial[e.material_id] = (viewsByMaterial[e.material_id] || 0) + 1; });

  const topMaterials = Object.entries(viewsByMaterial)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([id, count]) => {
      const m = materials.find(x => x.id === id);
      return { title: m ? m.title : "Material eliminado", views: count };
    });

  return { totalRevenue, totalSalesCount, uniqueStudents, totalMaterialEvents: events.length, totalMaterials: materials.length, topMaterials };
}
