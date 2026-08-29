// Cloudflare Worker: dealflow-site-server
// Serves published business sites at /<slug>, reading from the public
// `live_sites` view in Supabase (anon key — the view itself only exposes
// slug/business_name/site_html for deals with live = true, see
// supabase/migrations/0002_live_sites.sql). Nothing here writes to the
// database; publishing a site is a deliberate action taken elsewhere
// (setting deals.live = true), never a side effect of this Worker.
//
// Bindings required (see wrangler.toml):
//   SUPABASE_URL       - the project's REST URL, e.g. https://<ref>.supabase.co
//   SUPABASE_ANON_KEY  - the project's anon/public key (safe for this use —
//                        it can only ever read the narrow live_sites view)

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function page(body: string): Response {
  return new Response(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font-family:system-ui,sans-serif;text-align:center;padding:80px 20px;">${body}</body></html>`,
    { headers: { "content-type": "text/html;charset=UTF-8" } }
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const slug = url.pathname.replace(/^\/+|\/+$/g, "");

    if (!slug) {
      return page("<h1>Steelman Websites site host</h1><p>Published business sites are served at <code>/&lt;slug&gt;</code>.</p>");
    }

    const apiUrl = `${env.SUPABASE_URL}/rest/v1/live_sites?slug=eq.${encodeURIComponent(slug)}&select=business_name,site_html&limit=1`;
    const res = await fetch(apiUrl, {
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      },
    });

    if (!res.ok) {
      return page("<h1>500</h1><p>Couldn't load this site right now. Try again shortly.</p>");
    }

    const rows: { business_name: string; site_html: string }[] = await res.json();
    if (!rows.length) {
      return new Response(page(`<h1>404</h1><p>No published site for "${escapeHtml(slug)}".</p>`).body, {
        status: 404,
        headers: { "content-type": "text/html;charset=UTF-8" },
      });
    }

    return new Response(rows[0].site_html, { headers: { "content-type": "text/html;charset=UTF-8" } });
  },
};
