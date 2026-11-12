import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import type { Ticket } from '@/data/tickets';
import { fetchEventTickets, fetchRevenue, fetchStaffEventIds } from './api';
import { useAuth } from './auth';

type State = { tickets: Ticket[]; staffFor: string[]; revenue: Record<string, number>; loading: boolean; error: string | null };

// Tickets for events the signed-in person runs or staffs, reloaded each time
// the screen comes into focus so check-ins from other phones show up.
export function useGuestList(eventIds: string[]) {
  const { email } = useAuth();
  const [state, setState] = useState<State>({ tickets: [], staffFor: [], revenue: {}, loading: true, error: null });
  const key = eventIds.join(',');

  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const staffFor = email ? await fetchStaffEventIds(email) : [];
      const ids = [...new Set([...(key ? key.split(',') : []), ...staffFor])];
      const [tickets, revenue] = await Promise.all([fetchEventTickets(ids), fetchRevenue().catch(() => ({}))]);
      setState({ tickets, staffFor, revenue, loading: false, error: null });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : 'Couldn’t load sales.' }));
    }
  }, [key, email]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return { ...state, reload };
}
