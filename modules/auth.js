/**
 * auth.js — STUB (login removido)
 * A app funciona localmente sem autenticação Supabase.
 */

export const supabase = null;

export async function checkSession() {
  // Retorna sempre uma sessão mock para não bloquear a app
  return { user: { id: 'local-user' } };
}

export async function signInWithEmail(email, password) {
  return { data: null, error: { message: 'Login desativado nesta versão local.' } };
}

export async function signOut() {
  console.log('[auth] signOut called (no-op in local mode)');
}

export async function signUpWithEmail(email, password) {
  return { data: null, error: { message: 'Registo desativado nesta versão local.' } };
}
