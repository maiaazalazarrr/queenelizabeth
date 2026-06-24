/* ═══════════════════════════════════════════════════
/* ═══════════════════════════════════════════════════
   QUEEN ELIZABETH ACADEMY — backend.js
   Conexión real a Supabase: materiales, estadísticas y ventas.
═══════════════════════════════════════════════════ */

"use strict";

const SUPABASE_URL = "https://nuqvqeynhssipmcmebxb.supabase.co"; 
const SUPABASE_ANON_KEY = "sb_publishable_WjBgPoBpB1ONRrQh_JSucA_X_cCiDZY";

// Cliente global de Supabase (la librería se carga vía CDN en index.html)
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Bucket donde se guardan los archivos subidos
const MATERIALS_BUCKET = "materials";

// ── Identidad simple del alumno (sin login todavía) ──
// Se guarda en localStorage solo para no pedir el nombre/email cada vez
// en ESTE navegador. No es una sesión segura ni multi-dispositivo.
function getStudentIdentity() {
  let name = localStorage.getItem("qe_student_name");
  let email = localStorage.getItem("qe_student_email");
  return { name, email };
}

function setStudentIdentity(name, email) {
  localStorage.setItem("qe_student_name", String(name).trim());
  localStorage.setItem("qe_student_email", String(email).trim());
}

// ── CONSULTAS GENERALES — VISTA DEL ALUMNO ──────────────────

/**
 * Trae todos los materiales activos, uniendo información de lección y curso.
 * Ordena por fecha de creación descendente.
 */
async function fetchAllMaterials() {
  const { data, error } = await supabaseClient
    .from("materials")
    .select(`
      id,
      title,
      type,
      description,
      file_path,
      external_url,
      created_at,
      lessons (
        id,
        title,
        courses (
          id,
          title,
          level
        )
      )
    `)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Obtiene la URL pública de un archivo subido al Storage de Supabase.
 */
function getMaterialPublicUrl(filePath) {
  if (!filePath) return null;
  const { data } = supabaseClient.storage
    .from(MATERIALS_BUCKET)
    .getPublicUrl(filePath);
  return data?.publicUrl || null;
}

/**
 * Registra en la base de datos que un alumno vio o descargó un material.
 */
async function logMaterialEvent(materialId, action = "view") {
  const { name, email } = getStudentIdentity();
  const { error } = await supabaseClient
    .from("material_events")
    .insert([{
      material_id: materialId,
      action: action, // 'view' o 'download'
      student_name: name || "Anónimo",
      student_email: email || "anonimo@academy.com"
    }]);

  if (error) console.error("Error al registrar evento:", error);
}

// ── OPERACIONES DEL PANEL DOCENTE (GESTIÓN) ──────────────────

async function fetchCourses() {
  const { data, error } = await supabaseClient
    .from("courses")
    .select("*")
    .order("title");
  if (error) throw error;
  return data || [];
}

async function createCourse(title, level) {
  const { data, error } = await supabaseClient
    .from("courses")
    .insert([{ title, level }])
    .select();
  if (error) throw error;
  return data;
}

async function fetchLessons(courseId) {
  const { data, error } = await supabaseClient
    .from("lessons")
    .select("*")
    .eq("course_id", courseId)
    .order("position");
  if (error) throw error;
  return data || [];
}

async function createLesson(courseId, title, position = 1) {
  const { data, error } = await supabaseClient
    .from("lessons")
    .insert([{ course_id: courseId, title, position }])
    .select();
  if (error) throw error;
  return data;
}

/**
 * Sube un material. Si incluye archivo físico, lo sube primero a Storage.
 * Soporta 'file' nulo si el tipo es 'link' (enlace externo).
 */
async function uploadMaterial({ file, lessonId, title, type, description, externalUrl }) {
  let filePath = null;

  // Si hay un archivo seleccionado en el input, subirlo al Bucket
  if (file && type !== "link") {
    // Sanitizar un poco el nombre para evitar caracteres extraños
    const fileExt = file.name.split(".").pop();
    const cleanName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
    
    const { data: storageData, error: storageError } = await supabaseClient.storage
      .from(MATERIALS_BUCKET)
      .upload(cleanName, file);

    if (storageError) throw storageError;
    filePath = storageData.path; // Ruta interna dentro del bucket
  }

  // Insertar fila en la tabla 'materials'
  const { data, error } = await supabaseClient
    .from("materials")
    .insert([{
      lesson_id: lessonId,
      title,
      type,
      description,
      file_path: filePath,
      external_url: type === "link" ? externalUrl : null
    }])
    .select();

  if (error) throw error;
  return data;
}

/**
 * Elimina el registro del material. Si tenía un archivo físico, también lo borra de Storage.
 */
async function deleteMaterial(materialId, filePath = null) {
  // 1. Borrar fila
  const { error: dbError } = await supabaseClient
    .from("materials")
    .delete()
    .eq("id", materialId);

  if (dbError) throw dbError;

  // 2. Borrar del Storage si existe ruta
  if (filePath) {
    const { error: storageError } = await supabaseClient.storage
      .from(MATERIALS_BUCKET)
      .remove([filePath]);
    if (storageError) console.error("Aviso: No se pudo borrar el archivo físico del storage:", storageError.message);
  }
}

// ── PASARELA DE VENTAS SIMULADA ─────────────────────────────

/**
 * Registra una inscripción o compra desde los planes de precios.
 */
async function registerSale({ planId, planName, amount, studentName, studentEmail }) {
  const { data, error } = await supabaseClient
    .from("sales")
    .insert([{
      plan_id: planId,
      plan_name: planName,
      amount: amount,
      student_name: studentName,
      student_email: studentEmail,
      status: "pagado" // Simula que el pago entró de inmediato
    }])
    .select();

  if (error) throw error;
  return data;
}

// ── PROCESAMIENTO DE ESTADÍSTICAS (Métrica unificada) ─────────

/**
 * Consulta las tablas reales en Supabase y consolida las métricas del dashboard.
 */
async function fetchRealStats() {
  const [salesRes, eventsRes, materialsRes] = await Promise.all([
    supabaseClient.from("sales").select("amount, status, student_email"),
    supabaseClient.from("material_events").select("material_id, action, student_email, created_at"),
    supabaseClient.from("materials").select("id, title"),
  ]);

  const sales = salesRes.data || [];
  const events = eventsRes.data || [];
  const materials = materialsRes.data || [];

  const totalRevenue = sales
    .filter(s => s.status === "pagado")
    .reduce((sum, s) => sum + Number(s.amount), 0);

  const totalSalesCount = sales.length;

  const uniqueStudents = new Set(
    [...sales.map(s => s.student_email), ...events.map(e => e.student_email)].filter(Boolean)
  ).size;

  const viewsByMaterial = {};
  events.forEach(e => {
    viewsByMaterial[e.material_id] = (viewsByMaterial[e.material_id] || 0) + 1;
  });

  const topMaterials = Object.entries(viewsByMaterial)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([materialId, count]) => {
      const material = materials.find(m => m.id === materialId);
      return { title: material ? material.title : "Material eliminado", views: count };
    });

  return {
    totalRevenue,
    totalSalesCount,
    uniqueStudents,
    totalMaterialEvents: events.length,
    totalMaterials: materials.length,
    topMaterials,
  };
}

// ── ACCESO AL PANEL DOCENTE (gate código simple) ───────────────
function checkTeacherAccess(inputCode) {
  const TEACHER_CODE = "QE2025SECRET"; // Cambialo por el que quieras usar
  return String(inputCode).trim() === TEACHER_CODE;
}
