import { create } from 'zustand';
import { authRepo, type AuthSession } from '@/lib/repo/auth';

type SessionState = {
  session: AuthSession;
  /** False until the initial getSession() settles — gates route redirects. */
  ready: boolean;
  /**
   * Invite code captured while logged out, replayed after authentication so a
   * logged-out user hitting /join/[code] lands back on the join flow.
   */
  pendingInviteCode: string | null;
  setSession: (session: AuthSession) => void;
  setPendingInviteCode: (code: string | null) => void;
  /** Subscribes to auth changes. Returns an unsubscribe fn. */
  bootstrap: () => Promise<() => void>;
};

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  ready: false,
  pendingInviteCode: null,

  setSession: (session) => set({ session }),
  setPendingInviteCode: (pendingInviteCode) => set({ pendingInviteCode }),

  bootstrap: async () => {
    try {
      const session = await authRepo.getSession();
      set({ session, ready: true });
    } catch {
      set({ session: null, ready: true });
    }
    return authRepo.onChange((session) => set({ session, ready: true }));
  },
}));
