// Card payments through Bank of Maldives Connect (BML Connect).
//
//   POST { action: 'start', paymentId, returnUrl }  (signed-in buyer)
//     Creates a BML transaction for the payment's amount (always read from the
//     database, never from the app) and returns the hosted payment page URL.
//   POST { action: 'verify', paymentId }            (signed-in buyer)
//     Fetches the transaction from BML and, if it's confirmed for the right
//     amount, settles the payment. The app calls this when the buyer returns.
//   POST ?webhook=1                                 (BML)
//     Treated only as a hint: the transaction is fetched from BML and checked
//     the same way, so a forged webhook can't mark anything paid.
//
// Secrets (supabase secrets set ...):
//   BML_API_KEY        API key from the BML merchant portal (sandbox or production)
//   BML_MODE           'sandbox' (UAT) or 'production'
//   RETURN_URL_PREFIXES comma-separated prefixes the app may return to
//                      (default: eventspace://,https://eventspace.mv/)
//
// Request shape follows BML's official SDK (github.com/bankofmaldives/bml-connect-php):
// Authorization header is the API key; the body carries amount (laari),
// currency, redirectUrl, localId, apiVersion 2.0, signMethod sha1 and
// signature = sha1("amount=<amount>&currency=<currency>&apiKey=<key>").
// Check the transaction state names against BML's current docs before going
// live; only the states in PAID_STATES settle a payment.

import { createClient } from 'npm:@supabase/supabase-js@2';

const ENDPOINTS = {
  sandbox: 'https://api.uat.merchants.bankofmaldives.com.mv/public/',
  production: 'https://api.merchants.bankofmaldives.com.mv/public/',
};
const PAID_STATES = new Set(['CONFIRMED']);

const env = (k: string) => Deno.env.get(k) ?? '';
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });

async function sha1Hex(s: string) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bmlBase() {
  return env('BML_MODE') === 'production' ? ENDPOINTS.production : ENDPOINTS.sandbox;
}

async function bml(path: string, init: RequestInit = {}) {
  const key = env('BML_API_KEY');
  if (!key) throw new Error('gateway_not_configured');
  const res = await fetch(bmlBase() + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: key, ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`gateway_error_${res.status}`);
  return body as Record<string, unknown>;
}

type PaymentRow = {
  id: string;
  reference: string;
  payer_id: string | null;
  amount: number;
  currency: string;
  status: string;
  method: string | null;
  provider_ref: string | null;
};

async function loadPayment(id: string): Promise<PaymentRow | null> {
  const { data } = await admin
    .from('payments')
    .select('id, reference, payer_id, amount, currency, status, method, provider_ref')
    .eq('id', id)
    .maybeSingle();
  return data as PaymentRow | null;
}

function allowedReturn(url: string) {
  const prefixes = (env('RETURN_URL_PREFIXES') || 'eventspace://,https://eventspace.mv/').split(',').map((s) => s.trim());
  return prefixes.some((p) => p && url.startsWith(p));
}

// Fetches the transaction from BML and settles the payment if it's paid in full.
async function verify(p: PaymentRow) {
  if (!p.provider_ref) return { status: p.status };
  const txn = await bml(`transactions/${encodeURIComponent(p.provider_ref)}`);
  const state = String(txn.state ?? '').toUpperCase();
  const amount = Number(txn.amount);
  const currency = String(txn.currency ?? 'MVR');
  if (PAID_STATES.has(state) && amount === p.amount && currency === p.currency) {
    const { data, error } = await admin.rpc('gateway_settle', {
      p_payment_id: p.id,
      p_provider: 'bml',
      p_provider_ref: p.provider_ref,
      p_amount: amount,
    });
    if (error) throw new Error(error.message);
    return { status: data as string };
  }
  return { status: p.status, gatewayState: state };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const url = new URL(req.url);

    // BML webhook: find the payment by transaction id or our reference, then verify.
    if (url.searchParams.get('webhook')) {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      const txnId = String(body.id ?? body.transactionId ?? '');
      const localId = String(body.localId ?? '');
      let q = admin.from('payments').select('id').eq('provider', 'bml');
      q = txnId ? q.eq('provider_ref', txnId) : q.eq('reference', localId);
      const { data } = await q.maybeSingle();
      if (data) {
        const p = await loadPayment((data as { id: string }).id);
        if (p && p.status === 'pending') await verify(p);
      }
      return json({ ok: true });
    }

    // Everything else is the signed-in buyer.
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth } = await admin.auth.getUser(token);
    const userId = auth?.user?.id;
    if (!userId) return json({ error: 'not_signed_in' }, 401);

    const { action, paymentId, returnUrl } = (await req.json()) as { action?: string; paymentId?: string; returnUrl?: string };
    const p = paymentId ? await loadPayment(paymentId) : null;
    if (!p || p.payer_id !== userId) return json({ error: 'payment_not_found' }, 404);

    if (action === 'start') {
      if (p.status !== 'pending' || p.method !== 'card') return json({ error: 'payment_not_pending' }, 409);
      if (!returnUrl || !allowedReturn(returnUrl)) return json({ error: 'invalid_return_url' }, 400);
      const key = env('BML_API_KEY');
      const body = {
        amount: p.amount,
        currency: p.currency,
        redirectUrl: returnUrl,
        localId: p.reference,
        customerReference: p.reference,
        apiVersion: '2.0',
        appVersion: 'Tikkit',
        signMethod: 'sha1',
        signature: await sha1Hex(`amount=${p.amount}&currency=${p.currency}&apiKey=${key}`),
      };
      const txn = await bml('transactions', { method: 'POST', body: JSON.stringify(body) });
      const txnId = String(txn.id ?? '');
      const pageUrl = String(txn.url ?? txn.shortUrl ?? '');
      if (!txnId || !pageUrl) throw new Error('gateway_bad_response');
      await admin.from('payments').update({ provider: 'bml', provider_ref: txnId }).eq('id', p.id).eq('status', 'pending');
      return json({ url: pageUrl });
    }

    if (action === 'verify') return json(await verify(p));

    return json({ error: 'unknown_action' }, 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'gateway_error';
    console.error('payments', message);
    return json({ error: message }, 502);
  }
});
