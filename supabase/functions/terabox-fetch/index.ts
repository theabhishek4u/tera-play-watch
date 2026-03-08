const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const TERA_API = 'https://tera-core.vercel.app';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, action } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    if (!surl) {
      return new Response(
        JSON.stringify({ success: false, error: 'Could not extract share code from URL' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing surl:', surl, 'action:', action);

    // If action is "stream", return HLS stream URL
    if (action === 'stream') {
      const qualities = ['M3U8_AUTO_720', 'M3U8_AUTO_480', 'M3U8_AUTO_360'];
      
      for (const quality of qualities) {
        try {
          const streamUrl = `${TERA_API}/api?mode=stream&surl=${encodeURIComponent(surl)}&type=${quality}`;
          console.log('Trying stream quality:', quality);
          const streamRes = await fetch(streamUrl, { headers: { 'User-Agent': UA } });
          
          if (streamRes.ok) {
            const contentType = streamRes.headers.get('content-type') || '';
            const body = await streamRes.text();
            
            if (body.includes('#EXTM3U') || contentType.includes('mpegurl')) {
              console.log('HLS stream available at quality:', quality);
              return new Response(
                JSON.stringify({
                  success: true,
                  data: {
                    streamUrl,
                    quality,
                    type: 'hls',
                  }
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          } else {
            await streamRes.text();
          }
        } catch (e) {
          console.log('Stream quality failed:', quality, e);
        }
      }

      return new Response(
        JSON.stringify({ success: false, error: 'HLS stream not available for this video' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Default: fetch file info
    const api2Url = `${TERA_API}/api2?url=${encodeURIComponent(url.trim())}`;
    console.log('Fetching file info from api2');
    
    const api2Res = await fetch(api2Url, { headers: { 'User-Agent': UA } });
    const api2Data = await api2Res.json();

    if (api2Data.status === 'success' && api2Data.files?.length > 0) {
      const files = api2Data.files.map((f: any) => ({
        name: f.filename || f.name || f.server_filename || 'Unknown',
        size: f.size || formatSize(f.size_bytes || 0),
        sizeBytes: f.size_bytes || 0,
        thumbnail: f.thumbnails?.original || f.thumbnail || '',
        isVideo: isVideoFile(f.filename || f.name || f.server_filename || ''),
        dlink: f.download_link || f.dlink || '',
        fsId: String(f.fs_id || Math.random()),
      }));

      // Build stream URL for the player (will be fetched separately by client)
      const streamBaseUrl = `${TERA_API}/api?mode=stream&surl=${encodeURIComponent(surl)}&type=M3U8_AUTO_720`;

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            title: files[0]?.name || 'TeraBox Video',
            files,
            surl,
            streamUrl: streamBaseUrl,
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fallback: try resolve mode
    const resolveUrl = `${TERA_API}/api?mode=resolve&surl=${encodeURIComponent(surl)}`;
    console.log('Trying resolve mode');
    const resolveRes = await fetch(resolveUrl, { headers: { 'User-Agent': UA } });
    const resolveData = await resolveRes.json();

    if (resolveData.errno === 0 && resolveData.list?.length > 0) {
      const files = resolveData.list.map((f: any) => ({
        name: f.server_filename || 'Unknown',
        size: formatSize(f.size || 0),
        sizeBytes: f.size || 0,
        thumbnail: f.thumbs?.url3 || f.thumbs?.url2 || '',
        isVideo: isVideoFile(f.server_filename || ''),
        dlink: f.dlink || '',
        fsId: String(f.fs_id || Math.random()),
      }));

      const streamBaseUrl = `${TERA_API}/api?mode=stream&surl=${encodeURIComponent(surl)}&type=M3U8_AUTO_720`;

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            title: files[0]?.name || 'TeraBox Video',
            files,
            surl,
            streamUrl: streamBaseUrl,
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Could not fetch video data. Link may be expired or invalid.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
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
