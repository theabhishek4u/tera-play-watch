const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Type',
};

const TERA_API = 'https://tera-core.vercel.app';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const surl = url.searchParams.get('surl');

    if (!surl) {
      return new Response('Missing surl parameter', { status: 400, headers: corsHeaders });
    }

    console.log('Proxy request for surl:', surl);

    // Get fresh download link from API
    const fakeTeraUrl = `https://www.terabox.app/sharing/link?surl=${surl}`;
    const api2Url = `${TERA_API}/api2?url=${encodeURIComponent(fakeTeraUrl)}`;
    
    const apiRes = await fetch(api2Url, { headers: { 'User-Agent': UA } });
    const apiData = await apiRes.json();

    if (apiData.status !== 'success' || !apiData.files?.length) {
      return new Response(JSON.stringify({ error: 'Could not get video link' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const dlink = apiData.files[0].download_link || apiData.files[0].dlink;
    if (!dlink) {
      return new Response(JSON.stringify({ error: 'No download link available' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Got fresh download link, proxying video...');

    // Forward range header for seeking support
    const rangeHeader = req.headers.get('range');
    const fetchHeaders: Record<string, string> = {
      'User-Agent': UA,
      'Referer': 'https://www.terabox.app/',
    };
    if (rangeHeader) {
      fetchHeaders['Range'] = rangeHeader;
    }

    // Fetch video from TeraBox
    const videoRes = await fetch(dlink, {
      headers: fetchHeaders,
      redirect: 'follow',
    });

    console.log('TeraBox response status:', videoRes.status);

    // Build response headers
    const responseHeaders: Record<string, string> = { ...corsHeaders };
    
    const contentType = videoRes.headers.get('content-type');
    if (contentType) responseHeaders['Content-Type'] = contentType;
    
    const contentLength = videoRes.headers.get('content-length');
    if (contentLength) responseHeaders['Content-Length'] = contentLength;
    
    const contentRange = videoRes.headers.get('content-range');
    if (contentRange) responseHeaders['Content-Range'] = contentRange;

    const acceptRanges = videoRes.headers.get('accept-ranges');
    if (acceptRanges) responseHeaders['Accept-Ranges'] = acceptRanges;

    return new Response(videoRes.body, {
      status: videoRes.status,
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
