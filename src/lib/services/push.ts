export type PushRegistration = { status: 'granted'; token: string } | { status: 'unavailable' | 'denied' };

export interface PushService {
  register(): Promise<PushRegistration>;
}

// Stub until expo-notifications and an APNs key are configured.
// Callers must treat every non-granted result as "continue without push".
export const pushService: PushService = {
  async register() {
    return { status: 'unavailable' };
  },
};
