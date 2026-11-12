import { useSyncExternalStore } from 'react';

// In-app dialogs and toasts, drawn by <DialogHost /> in the root layout, so
// prompts look like Tikkit instead of the system alert (and work on web).

export type DialogTone = 'default' | 'danger';
export type Dialog = {
  id: number;
  title: string;
  body?: string;
  action: string;
  // Null: a notice with a single button.
  cancel: string | null;
  tone: DialogTone;
  resolve(ok: boolean): void;
};
export type ToastTone = 'success' | 'error' | 'info';
export type Toast = { id: number; message: string; tone: ToastTone };

type State = { dialogs: Dialog[]; toast: Toast | null };
let state: State = { dialogs: [], toast: null };
let seq = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};

export function useDialogState() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

// Resolves true when the person taps the action, false when they cancel.
export function ask(opts: { title: string; body?: string; action: string; cancel?: string | null; tone?: DialogTone }): Promise<boolean> {
  return new Promise((resolve) => {
    const id = ++seq;
    const dialog: Dialog = {
      id,
      title: opts.title,
      body: opts.body,
      action: opts.action,
      cancel: opts.cancel === undefined ? 'Cancel' : opts.cancel,
      tone: opts.tone ?? 'default',
      resolve: (ok) => {
        set({ dialogs: state.dialogs.filter((d) => d.id !== id) });
        resolve(ok);
      },
    };
    set({ dialogs: [...state.dialogs, dialog] });
  });
}

// A message with one button, for things the person has to read.
export const notice = (title: string, body?: string, action = 'OK') => ask({ title, body, action, cancel: null }).then(() => {});

export function toast(message: string, tone: ToastTone = 'success') {
  clearTimeout(toastTimer);
  set({ toast: { id: ++seq, message, tone } });
  toastTimer = setTimeout(() => set({ toast: null }), tone === 'error' ? 4500 : 2800);
}
toast.error = (message: string) => toast(message, 'error');
toast.info = (message: string) => toast(message, 'info');
export const dismissToast = () => set({ toast: null });
