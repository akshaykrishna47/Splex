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
  ): Promise<{ needsConfirmation: boolean; alreadyRegistered: boolean }> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        ...(emailRedirectTo ? { emailRedirectTo } : {}),
      },
    });
    if (error) throw error;

    // Signing up with an address that already has an account does NOT return
    // an error. Supabase answers with a decoy user — real-looking id, no
    // session, and an empty `identities` array — specifically so that signup
    // cannot be used to discover which addresses are registered. That empty
    // array is the only signal there is; there is no error code to match on.
    //
    // The default (`?? 1`) matters: if a future version stops sending
    // `identities`, absence must read as "not registered" so a genuine signup
    // is never mistaken for a duplicate and blocked. Verified against the
    // hosted project — a real new user comes back with a populated array and
    // `role: "authenticated"`, the decoy with `[]` and `role: ""`.
    //
    // Only CONFIRMED accounts trigger this. Signing up again with an address
    // that registered but never confirmed re-sends the confirmation instead,
    // which is the behaviour you want: telling that person "account already
    // exists" would strand them with no way forward.
    const alreadyRegistered = (data.user?.identities?.length ?? 1) === 0;

    // Supabase returns a user with no session when email confirmation is on.
    return { needsConfirmation: !data.session, alreadyRegistered };
  },

  /**
   * Sends a recovery link. `redirectTo` must be allow-listed in the project's
   * auth settings or Supabase silently substitutes the Site URL.
   */
  async sendPasswordReset(email: string, redirectTo?: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(
      email,
      redirectTo ? { redirectTo } : undefined,
    );
    if (error) throw error;
  },

  /**
   * Sets a new password for the current session. The recovery link establishes
   * that session, which is why this needs no old password.
   */
  async updatePassword(password: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
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
