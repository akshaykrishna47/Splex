import { supabase } from '@/lib/supabase';

export type AuthUser = {
  id: string;
  email: string | null;
};

export type AuthSession = {
  user: AuthUser;
} | null;

function toSession(session: { user: { id: string; email?: string } } | null): AuthSession {
  if (!session) return null;
  return { user: { id: session.user.id, email: session.user.email ?? null } };
}

export const authRepo = {
  async getSession(): Promise<AuthSession> {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return toSession(data.session);
  },

  /**
   * Fires on sign-in, sign-out, and token refresh. Returns an unsubscribe fn.
   */
  onChange(cb: (session: AuthSession) => void): () => void {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      cb(toSession(session));
    });
    return () => data.subscription.unsubscribe();
  },

  async signInWithPassword(email: string, password: string): Promise<void> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },

  async signUpWithPassword(
    email: string,
    password: string,
    displayName: string,
    emailRedirectTo?: string,
  ): Promise<{ needsConfirmation: boolean }> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        ...(emailRedirectTo ? { emailRedirectTo } : {}),
      },
    });
    if (error) throw error;
    // Supabase returns a user with no session when email confirmation is on.
    return { needsConfirmation: !data.session };
  },

  async sendMagicLink(email: string, emailRedirectTo?: string): Promise<void> {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        ...(emailRedirectTo ? { emailRedirectTo } : {}),
      },
    });
    if (error) throw error;
  },

  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
};
