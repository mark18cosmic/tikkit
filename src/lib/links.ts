// Share links. They point at the share function, which gives Instagram,
// WhatsApp and Viber a title and poster, then sends people to the event.
// In production, route https://eventspace.mv/e/* to the function and set
// EXPO_PUBLIC_SHARE_URL=https://eventspace.mv.
const SHARE = (process.env.EXPO_PUBLIC_SHARE_URL || `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''}/functions/v1/share`).replace(/\/$/, '');

export const eventLink = (id: string, ref?: string) => `${SHARE}/e/${encodeURIComponent(id)}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`;
