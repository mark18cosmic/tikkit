// Share links that preview properly in Instagram, WhatsApp, Viber and iMessage.
//
//   GET /share/e/<event-id>[?ref=code]   HTML with Open Graph tags, then on to the event
//   GET /share/og/<event-id>.png         1200x630 poster for the preview
//
// Link crawlers don't run JavaScript, so the app's own pages can't give them a
// title and picture. This page does, then sends people to the web app (which
// opens the installed app via universal links when there is one).
//
// Env: WEB_URL (the deployed web app, default https://eventspace.mv) and
// SHARE_PUBLIC_URL (this function's public address, if it's behind your own domain).
// Deploy: npx supabase functions deploy share  (verify_jwt is off in config.toml)

import { createClient } from 'npm:@supabase/supabase-js@2';
import satori from 'npm:satori@0.12.0';
import { initWasm, Resvg } from 'npm:@resvg/resvg-wasm@2.6.2';

const WEB = (Deno.env.get('WEB_URL') || 'https://eventspace.mv').replace(/\/$/, '');
// Where crawlers can reach this function from outside (for the poster URL).
const PUBLIC = (Deno.env.get('SHARE_PUBLIC_URL') || `${Deno.env.get('SUPABASE_URL')}/functions/v1/share`).replace(/\/$/, '');
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });
// Satori takes React-like element objects; this builds them without React.
type Node = { type: string; props: Record<string, unknown> };
const h = (type: string, props: Record<string, unknown> | null, ...children: unknown[]): Node => {
  const kids = children.filter((c) => c !== null && c !== undefined && c !== false);
  return { type, props: { ...(props ?? {}), children: kids.length === 0 ? undefined : kids.length === 1 ? kids[0] : kids } };
};

// Everything pinned, fetched once per worker.
const CDN = 'https://cdn.jsdelivr.net/npm';
let ready: Promise<{ bold: ArrayBuffer; heavy: ArrayBuffer }> | null = null;
function assets() {
  ready ??= (async () => {
    const [wasm, bold, heavy] = await Promise.all([
      fetch(`${CDN}/@resvg/resvg-wasm@2.6.2/index_bg.wasm`).then((r) => r.arrayBuffer()),
      fetch(`${CDN}/@fontsource/outfit@5.1.0/files/outfit-latin-700-normal.woff`).then((r) => r.arrayBuffer()),
      fetch(`${CDN}/@fontsource/outfit@5.1.0/files/outfit-latin-800-normal.woff`).then((r) => r.arrayBuffer()),
    ]);
    await initWasm(wasm);
    return { bold, heavy };
  })();
  return ready;
}

type Ev = {
  id: string;
  title: string;
  currency: string;
  starts_at: string;
  venue_name: string;
  venue_area: string;
  description: string;
  image_url: string | null;
  image_path: string | null;
  organizer_name: string;
  status: string;
  tiers: { price: number }[];
};

async function load(id: string): Promise<Ev | null> {
  // Anonymous read: only approved events are visible.
  const { data } = await db
    .from('events')
    .select('id, title, starts_at, venue_name, venue_area, description, image_url, image_path, organizer_name, status, currency, tiers(price)')
    .eq('id', id)
    .maybeSingle();
  return data as Ev | null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const when = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Indian/Maldives' }).format(new Date(iso));
const price = (e: Ev) => {
  const min = Math.min(...e.tiers.map((t) => t.price));
  return !isFinite(min) ? '' : min === 0 ? 'Free entry' : `From ${e.currency === 'USD' ? 'USD' : 'MVR'} ${(min / 100).toLocaleString('en-GB', { maximumFractionDigits: 2 })}`;
};
const photo = (e: Ev) =>
  e.image_url ?? (e.image_path ? `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/event-images/${e.image_path}` : null);

function page(e: Ev, self: URL) {
  const target = `${WEB}/event/${encodeURIComponent(e.id)}${self.search}`;
  const desc = `${when(e.starts_at)} · ${e.venue_name}, ${e.venue_area}. ${price(e)}`;
  const image = `${PUBLIC}/og/${encodeURIComponent(e.id)}.png`;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(e.title)} · Tikkit</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Tikkit">
<meta property="og:title" content="${esc(e.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:url" content="${esc(target)}">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${esc(target)}">
<link rel="canonical" href="${esc(target)}">
<style>body{margin:0;font:16px/1.4 -apple-system,system-ui,sans-serif;background:#0C0C0E;color:#F4F4F5;display:grid;place-items:center;min-height:100dvh}
a{color:#FF6766;font-weight:600}main{padding:24px;max-width:480px}</style>
</head><body><main>
<h1>${esc(e.title)}</h1><p>${esc(desc)}</p>
<p><a href="${esc(target)}">Open on Tikkit</a></p>
</main><script>location.replace(${JSON.stringify(target)})</script></body></html>`;
}

// The Tikkit logo with a white word, for dark posters (assets/brand/tikkit-logo.svg).
const LOGO = 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 473.19 148.19" role="img" aria-label="tikkit logo"><title>tikkit logo</title><defs><linearGradient id="a" gradientUnits="userSpaceOnUse" x1="56" y1="126" x2="336" y2="386"><stop offset="0" stop-color="#FF6766"/><stop offset="1" stop-color="#CA2851"/></linearGradient></defs><g transform="translate(16.02 16.02) scale(0.37) translate(-42 -99)"><g transform="rotate(-10 256 256)"><path d="M92,126 H314 A22,22 0 0 0 358,126 H420 A36,36 0 0 1 456,162 V350 A36,36 0 0 1 420,386 H358 A22,22 0 0 0 314,386 H92 A36,36 0 0 1 56,350 V162 A36,36 0 0 1 92,126 Z" fill="#FFB173"/><path d="M92,126 H314 A22,22 0 0 0 336,148 V364 A22,22 0 0 0 314,386 H92 A36,36 0 0 1 56,350 V162 A36,36 0 0 1 92,126 Z" fill="url(#a)"/><path d="M191.13,195.86 Q196,186 200.87,195.86 L213.92,222.3 Q216.57,227.68 222.51,228.55 L251.69,232.79 Q262.57,234.37 254.7,242.05 L233.58,262.63 Q229.29,266.82 230.3,272.73 L235.29,301.79 Q237.14,312.63 227.41,307.51 L201.31,293.79 Q196,291 190.69,293.79 L164.59,307.51 Q154.86,312.63 156.71,301.79 L161.7,272.73 Q162.71,266.82 158.42,262.63 L137.3,242.05 Q129.43,234.37 140.31,232.79 L169.49,228.55 Q175.43,227.68 178.08,222.3 Z" fill="#FFE3B3"/><path d="M336,162 H336 A4,4 0 0 1 336,178 H336 A4,4 0 0 1 336,162 Z M336,190.67 H336 A4,4 0 0 1 336,206.67 H336 A4,4 0 0 1 336,190.67 Z M336,219.33 H336 A4,4 0 0 1 336,235.33 H336 A4,4 0 0 1 336,219.33 Z M336,248 H336 A4,4 0 0 1 336,264 H336 A4,4 0 0 1 336,248 Z M336,276.67 H336 A4,4 0 0 1 336,292.67 H336 A4,4 0 0 1 336,276.67 Z M336,305.33 H336 A4,4 0 0 1 336,321.33 H336 A4,4 0 0 1 336,305.33 Z M336,334 H336 A4,4 0 0 1 336,350 H336 A4,4 0 0 1 336,334 Z" fill="#FFE3B3"/></g></g><path transform="translate(202.67 114.14)" d="M37.3 -14.5V0H28.6Q19.3 0 14.1 -4.55Q8.9 -9.1 8.9 -19.4V-41.6H2.1V-55.8H8.9V-69.4H26V-55.8H37.2V-41.6H26V-19.2Q26 -16.7 27.2 -15.6Q28.4 -14.5 31.2 -14.5Z M44 -70.8Q44 -74.8 46.85 -77.45Q49.7 -80.1 54.2 -80.1Q58.6 -80.1 61.45 -77.45Q64.3 -74.8 64.3 -70.8Q64.3 -66.9 61.45 -64.25Q58.6 -61.6 54.2 -61.6Q49.7 -61.6 46.85 -64.25Q44 -66.9 44 -70.8ZM62.7 -55.8V0H45.6V-55.8Z M108 0 91 -23.4V0H73.9V-74H91V-33.1L107.9 -55.8H129L105.8 -27.8L129.2 0Z M168.6 0 151.6 -23.4V0H134.5V-74H151.6V-33.1L168.5 -55.8H189.6L166.4 -27.8L189.8 0Z M193.5 -70.8Q193.5 -74.8 196.35 -77.45Q199.2 -80.1 203.7 -80.1Q208.1 -80.1 210.95 -77.45Q213.8 -74.8 213.8 -70.8Q213.8 -66.9 210.95 -64.25Q208.1 -61.6 203.7 -61.6Q199.2 -61.6 196.35 -64.25Q193.5 -66.9 193.5 -70.8ZM212.2 -55.8V0H195.1V-55.8Z M254.5 -14.5V0H245.8Q236.5 0 231.3 -4.55Q226.1 -9.1 226.1 -19.4V-41.6H219.3V-55.8H226.1V-69.4H243.2V-55.8H254.4V-41.6H243.2V-19.2Q243.2 -16.7 244.4 -15.6Q245.6 -14.5 248.4 -14.5Z" fill="#FFFFFF"/></svg>`);

async function poster(e: Ev) {
  const { bold, heavy } = await assets();
  const img = photo(e);
  const tree = h('div', { style: { width: '100%', height: '100%', display: 'flex', position: 'relative', fontFamily: 'Outfit', backgroundImage: 'linear-gradient(160deg, #FFB173 0%, #FF6766 35%, #CA2851 65%, #3B0D22 100%)' } },
    img ? h('img', { src: img, width: 1200, height: 630, style: { position: 'absolute', top: 0, left: 0, width: 1200, height: 630, objectFit: 'cover' } }) : null,
    h('div', { style: { position: 'absolute', top: 0, left: 0, width: 1200, height: 630, backgroundImage: 'linear-gradient(180deg, rgba(12,12,14,0.1) 0%, rgba(12,12,14,0.88) 72%)' } }),
    h('div', { style: { position: 'absolute', left: 64, right: 64, bottom: 56, display: 'flex', flexDirection: 'column', color: 'white' } },
      h('div', { style: { fontSize: 30, fontWeight: 700, color: '#FFB173' } }, when(e.starts_at)),
      h('div', { style: { fontSize: 66, fontWeight: 800, lineHeight: 1.05, marginTop: 8 } }, e.title.slice(0, 70)),
      h('div', { style: { fontSize: 30, fontWeight: 700, marginTop: 14, opacity: 0.85 } }, `${e.venue_name}, ${e.venue_area}`),
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, fontSize: 30 } },
        h('div', { style: { fontWeight: 700 } }, e.status === 'cancelled' ? 'Cancelled' : price(e)),
        h('img', { src: LOGO, width: 141, height: 44 }),
      ),
    ),
  );
  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Outfit', data: bold, weight: 700, style: 'normal' },
      { name: 'Outfit', data: heavy, weight: 800, style: 'normal' },
    ],
  });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  return new Response(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const og = url.pathname.match(/\/og\/([a-z0-9-]{3,80})\.png$/);
  const ev = url.pathname.match(/\/e\/([a-z0-9-]{3,80})$/);
  const id = og?.[1] ?? ev?.[1];
  if (!id) return Response.redirect(WEB, 302);
  const e = await load(id);
  if (!e) return Response.redirect(WEB, 302);
  if (og) return poster(e);
  return new Response(page(e, url), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  });
});
