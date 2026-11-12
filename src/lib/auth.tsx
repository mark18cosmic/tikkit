import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { friendlyError, profileImage } from './api';
import { SUPABASE_KEY, SUPABASE_URL, supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

type Auth = {
  session: Session | null;
  // False until the stored session has been read, so screens don't flash "signed out".
  ready: boolean;
  userId: string | null;
  email: string | null;
  displayName: string;
  // Storage paths of the profile photo and banner, and their public URLs.
  avatarPath?: string;
  bannerPath?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  // Re-reads the profile after the name or pictures change.
  reloadProfile(): void;
};

const Ctx = createContext<Auth>({ session: null, ready: false, userId: null, email: null, displayName: '', reloadProfile: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<{ userId: string; name: string; avatarPath?: string; bannerPath?: string } | null>(null);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch(() => setSession(null))
      .finally(() => setReady(true));
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setReady(true);
      if (event === 'SIGNED_IN') {
        // Tickets sent to this email before the account existed.
        supabase.rpc('claim_tickets').then(() => {}, () => {});
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;
  const [profileVersion, setProfileVersion] = useState(0);
  useEffect(() => {
    if (!userId) return;
    supabase
      .from('profiles')
      .select('display_name, avatar_path, banner_path')
      .eq('id', userId)
      .maybeSingle()
      .then(
        ({ data }) =>
          setProfile({ userId, name: data?.display_name ?? '', avatarPath: data?.avatar_path ?? undefined, bannerPath: data?.banner_path ?? undefined }),
        () => {},
      );
  }, [userId, profileVersion]);
  const mine = profile && profile.userId === userId ? profile : null;
  const displayName = mine?.name ?? '';
  const avatarPath = mine?.avatarPath;
  const bannerPath = mine?.bannerPath;

  const value = useMemo<Auth>(
    () => ({
      session,
      ready,
      userId,
      email: session?.user.email ?? null,
      displayName,
      avatarPath,
      bannerPath,
      avatarUrl: profileImage(avatarPath),
      bannerUrl: profileImage(bannerPath),
      reloadProfile: () => setProfileVersion((v) => v + 1),
    }),
    [session, ready, userId, displayName, avatarPath, bannerPath],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (s: string) => EMAIL.test(s.trim());

export async function sendEmailCode(email: string) {
  const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } });
  if (error) throw new Error(friendlyError(error));
}

export async function verifyEmailCode(email: string, token: string) {
  const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token, type: 'email' });
  if (error) throw new Error(friendlyError(error));
}

// Asks the auth server, so people never land on a Google error page.
async function googleEnabled() {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY } });
    const body = (await res.json()) as { external?: { google?: boolean } };
    return !!body.external?.google;
  } catch {
    throw new Error(friendlyError(new Error('Network request failed')));
  }
}

// Resolves true when signed in, false when the person closed the sheet.
// Local test account from supabase/seed.sql. Only offered in development builds.
export const DEV_ACCOUNT = { email: 'admin@eventspace.mv', password: 'password123' };

export async function signInWithPassword(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(/invalid login/i.test(error.message) ? 'That email and password don’t match.' : friendlyError(error));
}

export async function signInWithGoogle(): Promise<boolean> {
  if (!(await googleEnabled())) {
    throw new Error('Google sign-in isn’t set up on this server yet. Use an email code instead.');
  }
  if (Platform.OS === 'web') {
    // Full-page redirect; the client finishes the PKCE exchange on return.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw new Error(friendlyError(error));
    return false;
  }
  const redirectTo = Linking.createURL('auth/callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data.url) throw new Error(friendlyError(error));
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return false;
  await completeOAuth(result.url);
  return true;
}

// Exchanges the one-time ?code= from the redirect for a session.
export async function completeOAuth(url: string) {
  const { queryParams } = Linking.parse(url);
  const code = typeof queryParams?.code === 'string' ? queryParams.code : null;
  const failure = queryParams?.error_description ?? queryParams?.error;
  if (!code) throw new Error(typeof failure === 'string' ? failure : 'Google sign-in didn’t finish. Try again.');
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw new Error(friendlyError(error));
}

export async function signOut() {
  await supabase.auth.signOut();
}

// Opens sign-in, then continues to `next` (an in-app path) once signed in.
export function goSignIn(next?: string) {
  router.push({ pathname: '/sign-in', params: next ? { next } : {} });
}

export async function updateDisplayName(userId: string, name: string) {
  const { error } = await supabase.from('profiles').update({ display_name: name.trim() }).eq('id', userId);
  if (error) throw new Error(friendlyError(error));
}

// Null removes the picture.
export async function updateProfileImages(userId: string, images: { avatarPath?: string | null; bannerPath?: string | null }) {
  const patch: { avatar_path?: string | null; banner_path?: string | null } = {};
  if (images.avatarPath !== undefined) patch.avatar_path = images.avatarPath;
  if (images.bannerPath !== undefined) patch.banner_path = images.bannerPath;
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) throw new Error(friendlyError(error));
}
