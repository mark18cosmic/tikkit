import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { AppState } from 'react-native';

import type { Announcement, Organizer } from '@/data/community';
import type { EventItem } from '@/data/events';
import type { Collection, PaymentConfig } from '@/data/money';
import type { MyStatus } from '@/data/trust';
import { ticketStatus, type CheckInResult, type Ticket } from '@/data/tickets';
import * as api from '@/lib/api';
import * as market from '@/lib/market';
import { useAuth } from '@/lib/auth';
import { toast } from '@/lib/dialog';
import { cancelReminders, ensureReminderPermission, scheduleReminders } from '@/lib/reminders';

export { ticketStatus, type CheckInResult, type Ticket, type TicketStatus } from '@/data/tickets';

export type WaitlistEntry = { eventId: string; tierId: string; joinedAt: string };

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

// Preferences kept on the device. Saved events and follows also sync to the
// account when signed in. Events and tickets live on the server and are cached
// here so tickets still open without a connection.
type Prefs = {
  saved: string[]; // event ids
  following: string[]; // organiser ids
  // Names for the organisers in `following`, for lists.
  followed: Pick<Organizer, 'id' | 'name' | 'slug' | 'avatar'>[];
  // Latest announcement seen per event, for the "new update" badge.
  seenUpdates: Record<string, string>;
  waitlist: WaitlistEntry[];
  remindersEnabled: boolean;
  reminderIds: Record<string, string[]>; // orderId -> scheduled notification ids
};

type State = Prefs & {
  hydrated: boolean;
  events: EventItem[];
  eventsState: LoadState;
  tickets: Ticket[];
  ticketsState: LoadState;
  // For events the person holds tickets to.
  announcements: Announcement[];
  // Verified, admin, Pro, unread notifications. Null when signed out.
  status: MyStatus | null;
  promoted: string[];
  collections: Collection[];
  paymentConfig: PaymentConfig | null;
  // Ticket code -> secret for rotating QR codes, cached for offline use.
  secrets: Record<string, string>;
  // Organiser id -> membership expiry, for presales.
  memberOf: Record<string, string>;
};

const initialPrefs: Prefs = { saved: [], following: [], followed: [], seenUpdates: {}, waitlist: [], remindersEnabled: true, reminderIds: {} };
const initial: State = {
  ...initialPrefs,
  hydrated: false,
  events: [],
  eventsState: 'idle',
  tickets: [],
  ticketsState: 'idle',
  announcements: [],
  status: null,
  promoted: [],
  collections: [],
  paymentConfig: null,
  secrets: {},
  memberOf: {},
};

type Action =
  | { type: 'hydrate'; prefs: Partial<Prefs>; events: EventItem[] }
  | { type: 'events'; state: LoadState; events?: EventItem[] }
  | { type: 'upsertEvent'; event: EventItem }
  | { type: 'tickets'; state: LoadState; tickets?: Ticket[] }
  | { type: 'toggleSaved'; eventId: string }
  | { type: 'toggleFollow'; organizer: Pick<Organizer, 'id' | 'name' | 'slug' | 'avatar'> }
  | { type: 'account'; saved: string[]; followed: Pick<Organizer, 'id' | 'name' | 'slug' | 'avatar'>[] }
  | { type: 'announcements'; list: Announcement[] }
  | { type: 'status'; status: MyStatus | null }
  | { type: 'discovery'; promoted: string[]; collections: Collection[] }
  | { type: 'paymentConfig'; config: PaymentConfig }
  | { type: 'secrets'; secrets: Record<string, string> }
  | { type: 'memberOf'; memberOf: Record<string, string> }
  | { type: 'waitlist'; list: WaitlistEntry[] }
  | { type: 'seen'; eventId: string; at: string }
  | { type: 'toggleWaitlist'; eventId: string; tierId: string }
  | { type: 'setReminders'; enabled: boolean }
  | { type: 'setReminderIds'; orderId: string; ids: string[] }
  | { type: 'resetPrefs' };

const UUID = /^[0-9a-f-]{36}$/;

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [item, ...list]);

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'hydrate':
      return {
        ...state,
        ...initialPrefs,
        ...action.prefs,
        // Follows used to be stored by organiser name; only ids carry over.
        following: (action.prefs.following ?? []).filter((id) => UUID.test(id)),
        followed: (action.prefs.followed ?? []).filter((o) => UUID.test(o.id)),
        hydrated: true,
        events: state.events.length ? state.events : action.events,
      };
    case 'events':
      return { ...state, eventsState: action.state, events: action.events ?? state.events };
    case 'upsertEvent':
      return { ...state, events: [action.event, ...state.events.filter((e) => e.id !== action.event.id)] };
    case 'tickets':
      return { ...state, ticketsState: action.state, tickets: action.tickets ?? state.tickets };
    case 'toggleSaved':
      return { ...state, saved: toggle(state.saved, action.eventId) };
    case 'toggleFollow': {
      const on = !state.following.includes(action.organizer.id);
      return {
        ...state,
        following: toggle(state.following, action.organizer.id),
        followed: on
          ? [action.organizer, ...state.followed.filter((o) => o.id !== action.organizer.id)]
          : state.followed.filter((o) => o.id !== action.organizer.id),
      };
    }
    case 'account':
      return { ...state, saved: action.saved, following: action.followed.map((o) => o.id), followed: action.followed };
    case 'announcements':
      return { ...state, announcements: action.list };
    case 'status':
      return { ...state, status: action.status };
    case 'discovery':
      return { ...state, promoted: action.promoted, collections: action.collections };
    case 'paymentConfig':
      return { ...state, paymentConfig: action.config };
    case 'secrets':
      return { ...state, secrets: action.secrets };
    case 'memberOf':
      return { ...state, memberOf: action.memberOf };
    case 'waitlist':
      return { ...state, waitlist: action.list };
    case 'seen':
      return { ...state, seenUpdates: { ...state.seenUpdates, [action.eventId]: action.at } };
    case 'toggleWaitlist': {
      const exists = state.waitlist.some((w) => w.eventId === action.eventId && w.tierId === action.tierId);
      return {
        ...state,
        waitlist: exists
          ? state.waitlist.filter((w) => !(w.eventId === action.eventId && w.tierId === action.tierId))
          : [{ eventId: action.eventId, tierId: action.tierId, joinedAt: new Date().toISOString() }, ...state.waitlist],
      };
    }
    case 'setReminders':
      return { ...state, remindersEnabled: action.enabled };
    case 'setReminderIds':
      return { ...state, reminderIds: { ...state.reminderIds, [action.orderId]: action.ids } };
    case 'resetPrefs':
      return { ...state, ...initialPrefs };
  }
}

const PREFS_KEY = 'eventspace/prefs/v2';
const EVENTS_KEY = 'eventspace/events/v2';
const ticketsKey = (userId: string) => `eventspace/tickets/v2/${userId}`;
const secretsKey = (userId: string) => `eventspace/secrets/v1/${userId}`;

type Store = State & {
  getEvent(id: string): EventItem | undefined;
  remaining(eventId: string, tierId: string): number;
  refreshEvents(): Promise<void>;
  refreshTickets(): Promise<void>;
  loadEvent(id: string): Promise<EventItem | null>;
  // Returns the order id. Paid orders wait for payment (see /pay).
  purchase(input: api.PurchaseInput): Promise<string>;
  // After a payment settles: tickets, reminders, wallet.
  afterPayment(): Promise<void>;
  refreshStatus(): Promise<void>;
  checkIn(rawCode: string): Promise<CheckInResult>;
  transfer(code: string, to: { name: string; email: string }): Promise<void>;
  requestRefund(code: string): Promise<void>;
  createEvent(draft: api.EventDraft, photo?: { uri: string; mimeType?: string }): Promise<string>;
  toggleSaved(eventId: string): void;
  toggleFollow(organizer: Pick<Organizer, 'id' | 'name' | 'slug' | 'avatar'>): void;
  markUpdatesSeen(eventId: string): void;
  toggleWaitlist(eventId: string, tierId: string): void;
  setReminders(enabled: boolean): Promise<boolean>;
  resetPrefs(): void;
};

const Ctx = createContext<Store | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const { userId, ready: authReady } = useAuth();
  const [state, dispatch] = useReducer(reducer, initial);
  // Latest state for callbacks that must stay referentially stable.
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    // Tickets from the device-only version are not real; drop them.
    AsyncStorage.removeItem('eventspace/v1').catch(() => {});
    Promise.all([AsyncStorage.getItem(PREFS_KEY), AsyncStorage.getItem(EVENTS_KEY)])
      .then(([prefs, events]) =>
        dispatch({
          type: 'hydrate',
          prefs: prefs ? (JSON.parse(prefs) as Partial<Prefs>) : {},
          events: events ? (JSON.parse(events) as EventItem[]) : [],
        }),
      )
      .catch(() => dispatch({ type: 'hydrate', prefs: {}, events: [] }));
  }, []);

  // Persist preferences only when one of them changes, not on every state update.
  const { hydrated, saved, following, followed, seenUpdates, waitlist, remindersEnabled, reminderIds } = state;
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ saved, following, followed, seenUpdates, waitlist, remindersEnabled, reminderIds }),
    ).catch(() => {});
  }, [hydrated, saved, following, followed, seenUpdates, waitlist, remindersEnabled, reminderIds]);

  const refreshEvents = useCallback(async () => {
    dispatch({ type: 'events', state: 'loading' });
    try {
      const events = await api.fetchEvents();
      dispatch({ type: 'events', state: 'ready', events });
      AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(events)).catch(() => {});
      Promise.all([market.fetchActivePromotions(), market.fetchCollections()]).then(
        ([promoted, collections]) => dispatch({ type: 'discovery', promoted, collections }),
        () => {},
      );
      market.fetchPaymentConfig().then((config) => dispatch({ type: 'paymentConfig', config }), () => {});
    } catch {
      dispatch({ type: 'events', state: 'error' });
    }
  }, []);

  const refreshTickets = useCallback(async () => {
    if (!userId) return;
    dispatch({ type: 'tickets', state: 'loading' });
    try {
      const tickets = await api.fetchMyTickets(userId);
      dispatch({ type: 'tickets', state: 'ready', tickets });
      AsyncStorage.setItem(ticketsKey(userId), JSON.stringify(tickets)).catch(() => {});
      market.fetchTicketSecrets().then(
        (secrets) => {
          dispatch({ type: 'secrets', secrets });
          AsyncStorage.setItem(secretsKey(userId), JSON.stringify(secrets)).catch(() => {});
        },
        () => {},
      );
      // Organiser updates for the events these tickets are for.
      const eventIds = [...new Set(tickets.filter((t) => !t.transferredTo).map((t) => t.eventId))];
      api.fetchAnnouncements(eventIds).then(
        (list) => dispatch({ type: 'announcements', list }),
        () => {},
      );
    } catch {
      dispatch({ type: 'tickets', state: 'error' });
    }
  }, [userId]);

  useEffect(() => {
    refreshEvents();
  }, [refreshEvents]);

  const refreshStatus = useCallback(async () => {
    if (!userId) return;
    try {
      dispatch({ type: 'status', status: await market.fetchMyStatus() });
      market.fetchMyMemberships().then((memberOf) => dispatch({ type: 'memberOf', memberOf }), () => {});
    } catch {
      // Keep the last known status.
    }
  }, [userId]);

  useEffect(() => {
    if (authReady && userId) refreshStatus();
  }, [authReady, userId, refreshStatus]);

  // Tickets follow the signed-in account: cached copy first, then the server.
  useEffect(() => {
    if (!authReady) return;
    if (!userId) {
      dispatch({ type: 'tickets', state: 'idle', tickets: [] });
      dispatch({ type: 'secrets', secrets: {} });
      dispatch({ type: 'status', status: null });
      dispatch({ type: 'memberOf', memberOf: {} });
      return;
    }
    let live = true;
    AsyncStorage.getItem(secretsKey(userId))
      .then((raw) => live && raw && dispatch({ type: 'secrets', secrets: JSON.parse(raw) as Record<string, string> }))
      .catch(() => {});
    AsyncStorage.getItem(ticketsKey(userId))
      .then((raw) => live && raw && dispatch({ type: 'tickets', state: 'loading', tickets: JSON.parse(raw) as Ticket[] }))
      .catch(() => {})
      .finally(() => live && refreshTickets());
    return () => {
      live = false;
    };
  }, [authReady, userId, refreshTickets]);

  // Back in the foreground: pick up check-ins, transfers and new events.
  // At most once a minute, so flicking between apps doesn't refetch everything.
  const lastForeground = useRef(0);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      if (Date.now() - lastForeground.current < 60_000) return;
      lastForeground.current = Date.now();
      refreshEvents();
      refreshTickets();
      refreshStatus();
    });
    return () => sub.remove();
  }, [refreshEvents, refreshTickets, refreshStatus]);

  // Saves and follows sync to the account. On sign-in, anything saved on this
  // device while signed out is merged in; on sign-out the device list clears.
  const syncedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!authReady || !state.hydrated) return;
    if (!userId) {
      if (syncedFor.current) dispatch({ type: 'account', saved: [], followed: [] });
      syncedFor.current = null;
      return;
    }
    if (syncedFor.current === userId) return;
    syncedFor.current = userId;
    const local = stateRef.current;
    market.fetchMyWaitlist().then(
      (server) => {
        const newLocal = local.waitlist.filter((w) => !server.some((x) => x.tierId === w.tierId));
        newLocal.forEach((w) => market.setWaitlist(w.tierId, true).catch(() => {}));
        dispatch({
          type: 'waitlist',
          list: [...newLocal, ...server.map((w) => ({ ...w, joinedAt: new Date().toISOString() }))],
        });
      },
      () => {},
    );
    Promise.all([api.fetchSaved(), api.fetchFollows()])
      .then(([saved, followed]) => {
        const newSaves = local.saved.filter((id) => !saved.includes(id));
        const newFollows = local.following.filter((id) => !followed.some((o) => o.id === id));
        newSaves.forEach((id) => api.setSaved(id, true).catch(() => {}));
        newFollows.forEach((id) => api.setFollow(id, true).catch(() => {}));
        const localFollowed = local.followed.filter((o) => newFollows.includes(o.id));
        dispatch({ type: 'account', saved: [...newSaves, ...saved], followed: [...localFollowed, ...followed] });
      })
      .catch(() => {
        syncedFor.current = null;
      });
  }, [authReady, userId, state.hydrated]);

  // Optimistic: flip locally, then tell the server; flip back if it fails.
  const toggleSaved = useCallback(
    (eventId: string) => {
      const on = !stateRef.current.saved.includes(eventId);
      dispatch({ type: 'toggleSaved', eventId });
      if (userId)
        api.setSaved(eventId, on).catch((e: Error) => {
          dispatch({ type: 'toggleSaved', eventId });
          toast.error(e.message);
        });
    },
    [userId],
  );

  const toggleFollow = useCallback(
    (organizer: Pick<Organizer, 'id' | 'name' | 'slug' | 'avatar'>) => {
      const on = !stateRef.current.following.includes(organizer.id);
      dispatch({ type: 'toggleFollow', organizer });
      if (on) toast(`Following ${organizer.name}. Their events show first on Explore.`);
      if (userId)
        api.setFollow(organizer.id, on).catch((e: Error) => {
          dispatch({ type: 'toggleFollow', organizer });
          toast.error(e.message);
        });
    },
    [userId],
  );

  const markUpdatesSeen = useCallback((eventId: string) => {
    const latest = stateRef.current.announcements.find((a) => a.eventId === eventId);
    if (latest && stateRef.current.seenUpdates[eventId] !== latest.createdAt) {
      dispatch({ type: 'seen', eventId, at: latest.createdAt });
    }
  }, []);

  const getEvent = useCallback((id: string) => state.events.find((e) => e.id === id), [state.events]);

  const remaining = useCallback(
    (eventId: string, tierId: string) => getEvent(eventId)?.tiers.find((t) => t.id === tierId)?.remaining ?? 0,
    [getEvent],
  );

  const loadEvent = useCallback(async (id: string) => {
    const event = await api.fetchEvent(id);
    if (event) dispatch({ type: 'upsertEvent', event });
    return event;
  }, []);

  // Reminders for orders whose tickets have arrived and have none yet.
  const scheduleMissingReminders = useCallback(async () => {
    const s = stateRef.current;
    if (!s.remindersEnabled) return;
    const orders = new Map<string, string>();
    s.tickets.filter((t) => ticketStatus(t) === 'active').forEach((t) => orders.set(t.orderId, t.eventId));
    for (const [orderId, eventId] of orders) {
      if (s.reminderIds[orderId]?.length) continue;
      const event = s.events.find((e) => e.id === eventId);
      if (!event) continue;
      const ids = await scheduleReminders(event).catch(() => [] as string[]);
      if (ids.length) dispatch({ type: 'setReminderIds', orderId, ids });
    }
  }, []);

  const purchase: Store['purchase'] = useCallback(
    async (input) => {
      const orderId = await api.purchase(input);
      await Promise.all([refreshTickets(), loadEvent(input.eventId).catch(() => null)]);
      scheduleMissingReminders().catch(() => {});
      return orderId;
    },
    [refreshTickets, loadEvent, scheduleMissingReminders],
  );

  const afterPayment = useCallback(async () => {
    await Promise.all([refreshTickets(), refreshEvents(), refreshStatus()]);
    scheduleMissingReminders().catch(() => {});
  }, [refreshTickets, refreshEvents, refreshStatus, scheduleMissingReminders]);

  const checkIn = useCallback((rawCode: string) => api.checkIn(rawCode), []);

  // Reminders are per order; drop them once no active ticket in that order remains.
  const releaseReminders = useCallback((code: string) => {
    const s = stateRef.current;
    const ticket = s.tickets.find((t) => t.code === code);
    if (!ticket) return;
    const othersActive = s.tickets.some(
      (t) => t.orderId === ticket.orderId && t.code !== code && ticketStatus(t) === 'active',
    );
    const ids = s.reminderIds[ticket.orderId];
    if (!othersActive && ids?.length) {
      cancelReminders(ids).catch(() => {});
      dispatch({ type: 'setReminderIds', orderId: ticket.orderId, ids: [] });
    }
  }, []);

  const transfer: Store['transfer'] = useCallback(
    async (code, to) => {
      await api.transferTicket(code, to.name, to.email);
      releaseReminders(code);
      await refreshTickets();
    },
    [releaseReminders, refreshTickets],
  );

  const requestRefund: Store['requestRefund'] = useCallback(
    async (code) => {
      await api.requestRefund(code);
      releaseReminders(code);
      await refreshTickets();
    },
    [releaseReminders, refreshTickets],
  );

  const createEvent: Store['createEvent'] = useCallback(
    async (draft, photo) => {
      if (!userId) throw new Error('Sign in to continue.');
      const imagePath = photo ? await api.uploadPhoto(userId, photo.uri, photo.mimeType) : undefined;
      const id = await api.createEvent({ ...draft, imagePath });
      await loadEvent(id).catch(() => null);
      return id;
    },
    [userId, loadEvent],
  );

  const setReminders: Store['setReminders'] = useCallback(
    async (enabled) => {
      const s = stateRef.current;
      if (!enabled) {
        await Promise.all(Object.values(s.reminderIds).map((ids) => cancelReminders(ids).catch(() => {})));
        Object.keys(s.reminderIds).forEach((orderId) => dispatch({ type: 'setReminderIds', orderId, ids: [] }));
        dispatch({ type: 'setReminders', enabled: false });
        return true;
      }
      if (!(await ensureReminderPermission())) return false;
      // Schedule for every order that still has an active ticket.
      const orders = new Map<string, string>();
      s.tickets.filter((t) => ticketStatus(t) === 'active').forEach((t) => orders.set(t.orderId, t.eventId));
      for (const [orderId, eventId] of orders) {
        const event = s.events.find((e) => e.id === eventId);
        if (!event) continue;
        const ids = await scheduleReminders(event).catch(() => [] as string[]);
        dispatch({ type: 'setReminderIds', orderId, ids });
      }
      dispatch({ type: 'setReminders', enabled: true });
      return true;
    },
    [],
  );

  const value = useMemo<Store>(
    () => ({
      ...state,
      getEvent,
      remaining,
      refreshEvents,
      refreshTickets,
      loadEvent,
      purchase,
      afterPayment,
      refreshStatus,
      checkIn,
      transfer,
      requestRefund,
      createEvent,
      setReminders,
      toggleSaved,
      toggleFollow,
      markUpdatesSeen,
      toggleWaitlist: (eventId, tierId) => {
        const on = !stateRef.current.waitlist.some((w) => w.tierId === tierId);
        dispatch({ type: 'toggleWaitlist', eventId, tierId });
        if (userId) market.setWaitlist(tierId, on).catch(() => dispatch({ type: 'toggleWaitlist', eventId, tierId }));
      },
      resetPrefs: () => {
        Object.values(stateRef.current.reminderIds).forEach((ids) => cancelReminders(ids).catch(() => {}));
        dispatch({ type: 'resetPrefs' });
      },
    }),
    [
      state,
      getEvent,
      remaining,
      refreshEvents,
      refreshTickets,
      loadEvent,
      purchase,
      afterPayment,
      refreshStatus,
      checkIn,
      transfer,
      requestRefund,
      createEvent,
      setReminders,
      toggleSaved,
      toggleFollow,
      markUpdatesSeen,
      userId,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppStore(): Store {
  const store = useContext(Ctx);
  if (!store) throw new Error('useAppStore must be used inside AppStoreProvider');
  return store;
}

// Wipes this account's cached tickets on sign-out or account deletion.
export async function clearAccountCache(userId: string | null) {
  if (!userId) return;
  await AsyncStorage.multiRemove([ticketsKey(userId), secretsKey(userId)]).catch(() => {});
}
