const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Type, Accept-Ranges',
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Referer/Origin combos to try — TeraBox checks these
const REFERER_ORIGINS = [
  { referer: 'https://www.terabox.com/', origin: 'https://www.terabox.com' },
  { referer: 'https://www.terabox.app/', origin: 'https://www.terabox.app' },
  { referer: 'https://dm.terabox.app/', origin: 'https://dm.terabox.app' },
  { referer: 'https://www.1024tera.com/', origin: 'https://www.1024tera.com' },
];

function getTeraBoxCookie(): string {
  const raw = Deno.env.get('TERABOX_NDUS') || '';
  let ndus = raw.trim().replace(/^['"]|['"]$/g, '');
  if (ndus.toLowerCase().startsWith('ndus=')) ndus = ndus.slice(5);
  ndus = ndus.split(';')[0].trim();
  return ndus ? `ndus=${ndus}; lang=en;` : 'lang=en;';
}

// Pick the best Referer/Origin based on the dlink domain
function pickReferer(dlink: string): { referer: string; origin: string } {
  try {
    const host = new URL(dlink).hostname;
    for (const ro of REFERER_ORIGINS) {
      if (host.includes(new URL(ro.origin).hostname.replace('www.', ''))) {
        return ro;
      }
    }
  } catch { /* ignore */ }
  return REFERER_ORIGINS[0];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const dlink = url.searchParams.get('dlink');

    if (!dlink) {
      return new Response(JSON.stringify({ error: 'Missing dlink parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const decoded = decodeURIComponent(dlink);
    console.log('Proxying video:', decoded.substring(0, 80) + '...');

    const { referer, origin } = pickReferer(decoded);

    // Forward range header for seeking support
    const headers: Record<string, string> = {
      'User-Agent': UA,
      'Cookie': getTeraBoxCookie(),
      'Referer': referer,
      'Origin': origin,
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
    };

    const rangeHeader = req.headers.get('range');
    if (rangeHeader) {
      headers['Range'] = rangeHeader;
    }

    // Try primary request
    let res = await fetch(decoded, {
      headers,
      redirect: 'follow',
    });

    // If the primary request fails, retry with alternate Referer/Origin combos
    if (!res.ok && res.status !== 206) {
      console.log(`Primary fetch failed (${res.status}), trying alternate Referer/Origin...`);
      for (const ro of REFERER_ORIGINS) {
        if (ro.referer === referer) continue;
        try {
          headers['Referer'] = ro.referer;
          headers['Origin'] = ro.origin;
          res = await fetch(decoded, {
            headers,
            redirect: 'follow',
          });
          if (res.ok || res.status === 206) {
            console.log(`Alternate ${ro.origin} worked!`);
            break;
          }
        } catch (e) {
          console.log(`Alternate ${ro.origin} error:`, e instanceof Error ? e.message : e);
        }
      }
    }

    if (!res.ok && res.status !== 206) {
      console.error('All upstream attempts failed:', res.status, res.statusText);
      return new Response(JSON.stringify({
        error: `Upstream returned ${res.status}. The download link may have expired — try fetching the video again.`,
      }), {
        status: res.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const responseHeaders: Record<string, string> = { ...corsHeaders };
    
    const ct = res.headers.get('content-type');
    if (ct) responseHeaders['Content-Type'] = ct;
    else responseHeaders['Content-Type'] = 'video/mp4';
    
    const cl = res.headers.get('content-length');
    if (cl) responseHeaders['Content-Length'] = cl;
    
    const cr = res.headers.get('content-range');
    if (cr) responseHeaders['Content-Range'] = cr;
    
    const ar = res.headers.get('accept-ranges');
    if (ar) responseHeaders['Accept-Ranges'] = ar;
    else responseHeaders['Accept-Ranges'] = 'bytes';

    return new Response(res.body, {
      status: res.status,
      headers: responseHeaders,
    });

  } catch (error) {
    console.error('Proxy error:', error);
    return new Response(JSON.stringify({
      error: 'Video proxy failed. The download link may have expired — try fetching the video again.',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

export {};

