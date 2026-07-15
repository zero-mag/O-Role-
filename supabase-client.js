/* ============================================================
   O ROLÊ+ — CAMADA DE DADOS (SUPABASE)
   Fase 2/3 do plano de migração: autenticação real + dados
   compartilhados entre usuários, no lugar do localStorage.
   Depende de config.js (SUPABASE_URL / SUPABASE_ANON_KEY) já
   carregado antes deste arquivo.
   ============================================================ */
const SUPABASE_READY = !!(window.SUPABASE_URL && window.SUPABASE_ANON_KEY && !window.SUPABASE_URL.includes('SEU-PROJETO'));
const sb = SUPABASE_READY ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY) : null;

/* ---------- AUTENTICAÇÃO ---------- */
async function sbSignUp({ email, password, name, type }) {
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { name, type } } // vira raw_user_meta_data, o trigger do banco cria o profile sozinho
  });
  if (error) throw error;
  return data.user;
}

async function sbSignIn({ email, password }) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

async function sbSignOut() {
  await sb.auth.signOut();
}

async function sbCurrentSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}

/* ---------- PROFILE (conta) ---------- */
async function sbGetProfile(userId) {
  const { data, error } = await sb.from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  return data;
}

async function sbUpdateProfile(userId, fields) {
  const { error } = await sb.from('profiles').update(fields).eq('id', userId);
  if (error) throw error;
}

/* ---------- ROOMS (mapa: negócios + rolês) ---------- */
async function sbLoadRooms() {
  const { data, error } = await sb
    .from('rooms')
    .select('*, vitrine_items(*), promocoes(*), profiles!rooms_owner_id_fkey(name, avatar_url)')
    .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString()); // esconde rolê pessoal já expirado
  if (error) throw error;
  return data;
}

async function sbCreateRoom(room) {
  const { data, error } = await sb.from('rooms').insert(room).select().single();
  if (error) throw error;
  return data;
}

async function sbUpdateRoom(roomId, fields) {
  const { error } = await sb.from('rooms').update(fields).eq('id', roomId);
  if (error) throw error;
}

async function sbDeleteRoom(roomId) {
  const { error } = await sb.from('rooms').delete().eq('id', roomId);
  if (error) throw error;
}

async function sbIncrementProfileViews(roomId) {
  const { error } = await sb.rpc('increment_profile_views', { p_room_id: roomId });
  if (error) throw error;
}

/* ---------- SALVOS / ENTROU / BLOQUEADOS (por usuário) ---------- */
async function sbLoadUserFlags(userId) {
  const { data, error } = await sb.from('user_room_flags').select('room_id, flag').eq('user_id', userId);
  if (error) throw error;
  return data;
}
async function sbAddFlag(userId, roomId, flag) {
  const { error } = await sb.from('user_room_flags').upsert({ user_id: userId, room_id: roomId, flag }, { onConflict: 'user_id,room_id,flag' });
  if (error) throw error;
}
async function sbRemoveFlag(userId, roomId, flag) {
  const { error } = await sb.from('user_room_flags').delete().eq('user_id', userId).eq('room_id', roomId).eq('flag', flag);
  if (error) throw error;
}

/* ---------- NOTIFICAÇÕES ---------- */
async function sbLoadNotifications(userId) {
  const { data, error } = await sb.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(30);
  if (error) throw error;
  return data;
}
async function sbMarkNotificationsRead(userId) {
  const { error } = await sb.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
  if (error) throw error;
}

// chama cb() toda vez que qualquer room muda (criada/editada/apagada) — é o "mapa ao vivo" de verdade
function sbSubscribeRooms(cb) {
  return sb
    .channel('rooms-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, cb)
    .subscribe();
}

/* ---------- VITRINE ---------- */
async function sbAddVitrineItem(roomId, item) {
  const { data, error } = await sb.from('vitrine_items').insert({ room_id: roomId, ...item }).select().single();
  if (error) throw error;
  return data;
}
async function sbUpdateVitrineItem(itemId, fields) {
  const { error } = await sb.from('vitrine_items').update(fields).eq('id', itemId);
  if (error) throw error;
}
async function sbDeleteVitrineItem(itemId) {
  const { error } = await sb.from('vitrine_items').delete().eq('id', itemId);
  if (error) throw error;
}

/* ---------- PROMOÇÕES ---------- */
async function sbAddPromocao(roomId, promo) {
  const { data, error } = await sb.from('promocoes').insert({ room_id: roomId, ...promo }).select().single();
  if (error) throw error;
  return data;
}
async function sbDeletePromocao(promoId) {
  const { error } = await sb.from('promocoes').delete().eq('id', promoId);
  if (error) throw error;
}

/* ---------- CHAT ---------- */
async function sbLoadMessages(roomId) {
  const { data, error } = await sb
    .from('messages').select('*').eq('room_id', roomId)
    .order('created_at', { ascending: true }).limit(200);
  if (error) throw error;
  return data;
}

async function sbSendMessage(roomId, senderName, texto) {
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from('messages').insert({
    room_id: roomId, sender_id: user ? user.id : null, sender_name: senderName, texto
  });
  if (error) throw error;
}

// chama cb(novaMensagem) em tempo real pra quem está na sala
function sbSubscribeMessages(roomId, cb) {
  return sb
    .channel('messages-room-' + roomId)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'room_id=eq.' + roomId }, payload => cb(payload.new))
    .subscribe();
}
