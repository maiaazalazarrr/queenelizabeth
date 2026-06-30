// library.js — funciones compartidas para admin y docente
// Requiere que SUPABASE_URL y SUPABASE_ANON_KEY estén definidos antes de este script.

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const BUCKET = 'library-files';

// Tipos de archivo que SÍ se suben a Supabase Storage.
// Video siempre es external_url (YouTube/Vimeo/etc), nunca se sube acá.
const UPLOADABLE_TYPES = ['pdf', 'audio', 'image', 'document'];

// --------- CARPETAS ---------

async function getFolders(parentFolderId = null) {
  let query = supabaseClient
    .from('library_folders')
    .select('*')
    .order('name', { ascending: true });

  if (parentFolderId === null) {
    query = query.is('parent_folder_id', null);
  } else {
    query = query.eq('parent_folder_id', parentFolderId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function createFolder(name, parentFolderId = null) {
  const { data: userData } = await supabaseClient.auth.getUser();
  const { data, error } = await supabaseClient
    .from('library_folders')
    .insert({
      name,
      parent_folder_id: parentFolderId,
      created_by: userData.user.id,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function renameFolder(folderId, newName) {
  const { error } = await supabaseClient
    .from('library_folders')
    .update({ name: newName })
    .eq('id', folderId);
  if (error) throw error;
}

async function deleteFolder(folderId) {
  // ON DELETE CASCADE en la tabla se encarga de subcarpetas;
  // los items quedan con folder_id null (ON DELETE SET NULL).
  const { error } = await supabaseClient
    .from('library_folders')
    .delete()
    .eq('id', folderId);
  if (error) throw error;
}

// --------- ITEMS ---------

async function getItems({ folderId = null, lessonId = null } = {}) {
  let query = supabaseClient.from('library_items').select('*').order('name');

  if (folderId !== undefined && folderId !== null) {
    query = query.eq('folder_id', folderId);
  } else if (folderId === null) {
    query = query.is('folder_id', null);
  }

  if (lessonId) {
    query = query.eq('lesson_id', lessonId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// Sube un archivo (pdf/audio/image/document) a Storage y crea el registro.
async function uploadFileItem({ file, type, folderId, lessonId }) {
  if (!UPLOADABLE_TYPES.includes(type)) {
    throw new Error(`El tipo "${type}" no se sube a Storage, usá createLinkItem() / video por URL`);
  }

  const { data: userData } = await supabaseClient.auth.getUser();
  const path = `${userData.user.id}/${Date.now()}_${file.name}`;

  const { error: uploadError } = await supabaseClient.storage
    .from(BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await supabaseClient
    .from('library_items')
    .insert({
      name: file.name,
      type,
      folder_id: folderId,
      lesson_id: lessonId || null,
      storage_path: path,
      file_size_bytes: file.size,
      uploaded_by: userData.user.id,
    })
    .select()
    .single();

  if (error) {
    // si falla el insert, limpiamos el archivo subido para no dejar huérfanos
    await supabaseClient.storage.from(BUCKET).remove([path]);
    throw error;
  }
  return data;
}

// Crea un item tipo "video" o "link" (siempre por URL externa, sin subir nada)
async function createLinkItem({ name, type, url, folderId, lessonId }) {
  if (type !== 'video' && type !== 'link') {
    throw new Error('createLinkItem es solo para type=video o type=link');
  }
  const { data: userData } = await supabaseClient.auth.getUser();
  const { data, error } = await supabaseClient
    .from('library_items')
    .insert({
      name,
      type,
      folder_id: folderId,
      lesson_id: lessonId || null,
      external_url: url,
      uploaded_by: userData.user.id,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteItem(item) {
  if (item.storage_path) {
    const { error: storageError } = await supabaseClient.storage
      .from(BUCKET)
      .remove([item.storage_path]);
    if (storageError) throw storageError;
  }
  const { error } = await supabaseClient
    .from('library_items')
    .delete()
    .eq('id', item.id);
  if (error) throw error;
}

// Devuelve una URL temporal (1 hora) para abrir/descargar un archivo de Storage.
async function getSignedUrl(storagePath) {
  const { data, error } = await supabaseClient.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}

// Abre un item: si es archivo de Storage pide signed URL, si es link/video abre directo.
async function openItem(item) {
  const url = item.external_url || (await getSignedUrl(item.storage_path));
  window.open(url, '_blank');
}
