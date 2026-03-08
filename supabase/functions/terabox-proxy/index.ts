const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Type',
};

const TERA_API = 'https://tera-core.vercel.app';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const surl = url.searchParams.get('surl');
    const type = url.searchParams.get('type') || 'm3u8'; // m3u8, segment
    const segmentUrl = url.searchParams.get('url'); // for segment proxy

    if (!surl && !segmentUrl) {
      return new Response('Missing parameters', { status: 400, headers: corsHeaders });
    }

    // Proxy a video segment
    if (type === 'segment' && segmentUrl) {
      console.log('Proxying segment');
      const decoded = decodeURIComponent(segmentUrl);
      const segRes = await fetch(decoded, {
        headers: { 'User-Agent': UA },
        redirect: 'follow',
      });
      
      const responseHeaders: Record<string, string> = { ...corsHeaders };
      const ct = segRes.headers.get('content-type');
      if (ct) responseHeaders['Content-Type'] = ct;
      const cl = segRes.headers.get('content-length');
      if (cl) responseHeaders['Content-Length'] = cl;
      
      return new Response(segRes.body, {
        status: segRes.status,
        headers: responseHeaders,
      });
    }

    // Proxy M3U8 playlist with rewritten URLs
    if (type === 'm3u8' && surl) {
      const quality = url.searchParams.get('quality') || 'M3U8_AUTO_720';
      const streamUrl = `${TERA_API}/api?mode=stream&surl=${encodeURIComponent(surl)}&type=${quality}`;
      console.log('Fetching M3U8:', streamUrl);
      
      const m3u8Res = await fetch(streamUrl, {
        headers: { 'User-Agent': UA },
      });

      if (!m3u8Res.ok) {
        const errBody = await m3u8Res.text();
        console.error('M3U8 fetch failed:', m3u8Res.status, errBody.slice(0, 200));
        
        // Try lower quality
        if (quality === 'M3U8_AUTO_720') {
          const fallbackUrl = `${TERA_API}/api?mode=stream&surl=${encodeURIComponent(surl)}&type=M3U8_AUTO_480`;
          console.log('Trying 480p fallback');
          const fbRes = await fetch(fallbackUrl, { headers: { 'User-Agent': UA } });
          if (fbRes.ok) {
            const fbContent = await fbRes.text();
            if (fbContent.includes('#EXTM3U')) {
              const rewritten = rewriteM3U8(fbContent, req.url, surl);
              return new Response(rewritten, {
                headers: { ...corsHeaders, 'Content-Type': 'application/vnd.apple.mpegurl' },
              });
            }
          }
          await fbRes.text();
        }
        
        return new Response(JSON.stringify({ error: 'Stream not available' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const m3u8Content = await m3u8Res.text();
      
      if (!m3u8Content.includes('#EXTM3U')) {
        console.error('Not a valid M3U8:', m3u8Content.slice(0, 100));
        return new Response(JSON.stringify({ error: 'Invalid stream response' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('Got valid M3U8, rewriting URLs');
      const rewritten = rewriteM3U8(m3u8Content, req.url, surl);
      
      return new Response(rewritten, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'no-cache',
        },
      });
    }

    return new Response('Invalid request', { status: 400, headers: corsHeaders });

  } catch (error) {
    console.error('Proxy error:', error);
    return new Response(JSON.stringify({ error: 'Proxy failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function rewriteM3U8(content: string, reqUrl: string, surl: string): string {
  // Get the base URL for our proxy
  const url = new URL(reqUrl);
  const proxyBase = `${url.origin}${url.pathname}`;
  
  // Rewrite segment URLs to go through our proxy
  const lines = content.split('\n');
  const rewritten = lines.map(line => {
    const trimmed = line.trim();
    // If it's a URL line (not a comment/tag), rewrite it
    if (trimmed && !trimmed.startsWith('#')) {
      if (trimmed.startsWith('http')) {
        // Absolute URL - proxy through our edge function
        return `${proxyBase}?surl=${surl}&type=segment&url=${encodeURIComponent(trimmed)}`;
      } else if (trimmed.endsWith('.ts') || trimmed.endsWith('.m4s') || trimmed.includes('.ts?')) {
        // Relative URL - construct full URL via tera-core segment proxy
        const segUrl = `${TERA_API}/api?mode=segment&url=${encodeURIComponent(trimmed)}`;
        return `${proxyBase}?surl=${surl}&type=segment&url=${encodeURIComponent(segUrl)}`;
      }
    }
    return line;
  });
  
  return rewritten.join('\n');
}
