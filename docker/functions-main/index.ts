// Edge runtime entry point: routes /<name>/... to supabase/functions/<name>.
// Both Tikkit functions run with verify_jwt = false (they check callers
// themselves), so there is no JWT check here.

const FUNCTIONS = new Set(['payments', 'share']);

Deno.serve(async (req: Request) => {
  const name = new URL(req.url).pathname.split('/')[1];
  if (!FUNCTIONS.has(name)) {
    return new Response(JSON.stringify({ msg: 'Function not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath: `/home/deno/functions/${name}`,
      memoryLimitMb: 192,
      workerTimeoutMs: 5 * 60 * 1000,
      noModuleCache: false,
      envVars: Object.entries(Deno.env.toObject()),
      forceCreate: false,
    });
    return await worker.fetch(req);
  } catch (e) {
    console.error(`${name}:`, e);
    return new Response(JSON.stringify({ msg: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
