const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Type, Accept-Ranges',
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function getTeraBoxCookie(): string {
  const raw = Deno.env.get('TERABOX_NDUS') || '';
  let ndus = raw.trim().replace(/^['"]|['"]$/g, '');
  if (ndus.toLowerCase().startsWith('ndus=')) ndus = ndus.slice(5);
  ndus = ndus.split(';')[0].trim();
  return ndus ? `ndus=${ndus}; lang=en;` : 'lang=en;';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const dlink = url.searchParams.get('dlink');

    if (!dlink) {
      return new Response('Missing dlink parameter', { status: 400, headers: corsHeaders });
    }

    const decoded = decodeURIComponent(dlink);
    console.log('Proxying video:', decoded.substring(0, 80) + '...');

    // Forward range header for seeking support
    const headers: Record<string, string> = {
      'User-Agent': UA,
      'Cookie': getTeraBoxCookie(),
      'Referer': 'https://www.terabox.com/',
      'Origin': 'https://www.terabox.com',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
    };

    const rangeHeader = req.headers.get('range');
    if (rangeHeader) {
      headers['Range'] = rangeHeader;
    }

    const res = await fetch(decoded, {
      headers,
      redirect: 'follow',
    });

    if (!res.ok && res.status !== 206) {
      console.error('Upstream error:', res.status, res.statusText);
      return new Response(JSON.stringify({ error: `Upstream returned ${res.status}` }), {
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
    return new Response(JSON.stringify({ error: 'Proxy failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
