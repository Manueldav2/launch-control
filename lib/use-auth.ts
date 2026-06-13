"use client";
// Tiny auth hook: current user + sign up / log in / sign out, plus the access
// token to authorize project saves. Sign-up goes through /api/auth/signup
// (server, instant-confirm via the service key) so there is no email-confirmation
// friction, then we sign the user in for a live session.
import { useEffect, useState, useCallback } from "react";
import { supabaseBrowser } from "./supabase-browser";

export type AuthUser = { id: string; email: string } | null;

export function useAuth() {
  const sb = supabaseBrowser();
  const [user, setUser] = useState<AuthUser>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!sb) { setReady(true); return; }
    sb.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      setUser(u ? { id: u.id, email: u.email || "" } : null);
      setReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      const u = session?.user;
      setUser(u ? { id: u.id, email: u.email || "" } : null);
    });
    return () => sub.subscription.unsubscribe();
  }, [sb]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!sb) throw new Error("Auth is not configured.");
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }, [sb]);

  const signUp = useCallback(async (email: string, password: string) => {
    // create the account server-side (instant-confirmed), then sign in
    const r = await fetch("/api/auth/signup", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "sign up failed");
    await signIn(email, password);
  }, [signIn]);

  const signOut = useCallback(async () => { await sb?.auth.signOut(); setUser(null); }, [sb]);

  const token = useCallback(async (): Promise<string> => {
    const { data } = (await sb?.auth.getSession()) || { data: { session: null } };
    return data.session?.access_token || "";
  }, [sb]);

  return { user, ready, available: !!sb, signIn, signUp, signOut, token };
}
