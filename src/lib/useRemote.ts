import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

type State<T> = { data: T | undefined; loading: boolean; error: string | null };

// Loads data from the server each time the screen comes into focus, so
// replies from the other side show up when people come back to a screen.
// `load` must be stable (wrap it in useCallback).
export function useRemote<T>(load: () => Promise<T>) {
  const [state, setState] = useState<State<T>>({ data: undefined, loading: true, error: null });

  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await load();
      setState({ data, loading: false, error: null });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : 'Something went wrong. Try again.' }));
    }
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return { ...state, reload };
}
