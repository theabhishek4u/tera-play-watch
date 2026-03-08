const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const TERA_API = 'https://tera-core.vercel.app';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing TeraBox URL:', url);

    // Extract surl from the URL
    let surl = '';
    try {
      const urlObj = new URL(url.trim());
      surl = urlObj.searchParams.get('surl') || '';
      if (!surl) {
        const pathMatch = urlObj.pathname.match(/\/s\/(.+)/);
        if (pathMatch) {
          surl = pathMatch[1];
        }
      }
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid URL format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Extracted surl:', surl);

    // Method 1: Try /api2 endpoint (direct download links)
    const api2Url = `${TERA_API}/api2?url=${encodeURIComponent(url.trim())}`;
    console.log('Trying /api2:', api2Url);
    
    const api2Res = await fetch(api2Url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });
    const api2Data = await api2Res.json();
    console.log('api2 response status:', api2Data.status);

    if (api2Data.status === 'success' && api2Data.files?.length > 0) {
      const files = api2Data.files.map((f: any) => ({
        name: f.name || f.server_filename || 'Unknown',
        size: f.size_formatted || formatSize(f.size || 0),
        sizeBytes: f.size || 0,
        thumbnail: f.thumbnail || f.thumbs?.url3 || '',
        isVideo: isVideoFile(f.name || f.server_filename || ''),
        dlink: f.download_link || f.dlink || '',
        fsId: String(f.fs_id || f.id || Math.random()),
      }));

      // Try to get streaming URL if surl available
      let streamUrl = '';
      if (surl) {
        try {
          const streamApiUrl = `${TERA_API}/api?mode=stream&surl=${encodeURIComponent(surl)}&type=M3U8_AUTO_720`;
          console.log('Fetching stream URL:', streamApiUrl);
          const streamRes = await fetch(streamApiUrl);
          if (streamRes.ok) {
            const contentType = streamRes.headers.get('content-type') || '';
            if (contentType.includes('mpegurl') || contentType.includes('m3u8')) {
              streamUrl = streamApiUrl;
              console.log('HLS stream available');
            } else {
              await streamRes.text(); // consume
            }
          } else {
            await streamRes.text();
          }
        } catch (e) {
          console.log('Stream fetch failed:', e);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            title: api2Data.title || files[0]?.name || 'TeraBox Video',
            files: files.map((f: any) => ({ ...f, streamUrl: f.isVideo ? streamUrl : '' })),
            surl,
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Method 2: Try /api with mode=resolve
    if (surl) {
      const resolveUrl = `${TERA_API}/api?mode=resolve&surl=${encodeURIComponent(surl)}`;
      console.log('Trying resolve mode:', resolveUrl);
      const resolveRes = await fetch(resolveUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        }
      });
      const resolveData = await resolveRes.json();
      console.log('resolve response:', JSON.stringify(resolveData).slice(0, 200));

      if (resolveData.errno === 0 && resolveData.list?.length > 0) {
        const files = resolveData.list.map((f: any) => ({
          name: f.server_filename || 'Unknown',
          size: formatSize(f.size || 0),
          sizeBytes: f.size || 0,
          thumbnail: f.thumbs?.url3 || f.thumbs?.url2 || '',
          isVideo: isVideoFile(f.server_filename || ''),
          dlink: f.dlink || '',
          fsId: String(f.fs_id || Math.random()),
          streamUrl: '',
        }));

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              title: resolveData.title || files[0]?.name || 'TeraBox Video',
              files,
              surl,
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Method 3: Try basic /api endpoint
    const apiUrl = `${TERA_API}/api?url=${encodeURIComponent(url.trim())}`;
    console.log('Trying basic /api:', apiUrl);
    const apiRes = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });
    const apiData = await apiRes.json();
    console.log('api response status:', apiData.status);

    if (apiData.status === 'success' && apiData.files?.length > 0) {
      const files = apiData.files.map((f: any) => ({
        name: f.name || f.server_filename || 'Unknown',
        size: f.size_formatted || formatSize(f.size || 0),
        sizeBytes: f.size || 0,
        thumbnail: f.thumbnail || '',
        isVideo: isVideoFile(f.name || f.server_filename || ''),
        dlink: f.download_link || f.dlink || '',
        fsId: String(f.fs_id || f.id || Math.random()),
        streamUrl: '',
      }));

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            title: files[0]?.name || 'TeraBox Video',
            files,
            surl,
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: 'Could not fetch video data. The link may be expired, password-protected, or invalid.',
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function isVideoFile(filename: string): boolean {
  const videoExts = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp', '.ts'];
  return videoExts.some(ext => filename.toLowerCase().endsWith(ext));
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
