const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const TERA_API = 'https://tera-core.vercel.app';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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

    // Extract surl
    let surl = '';
    try {
      const urlObj = new URL(url.trim());
      surl = urlObj.searchParams.get('surl') || '';
      if (!surl) {
        const pathMatch = urlObj.pathname.match(/\/s\/(.+)/);
        if (pathMatch) surl = pathMatch[1];
      }
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid URL' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!surl) {
      return new Response(
        JSON.stringify({ success: false, error: 'Could not extract share code' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching info for surl:', surl);

    // Get file info from tera-core
    const api2Url = `${TERA_API}/api2?url=${encodeURIComponent(url.trim())}`;
    const apiRes = await fetch(api2Url, { headers: { 'User-Agent': UA } });
    const apiData = await apiRes.json();

    if (apiData.status === 'success' && apiData.files?.length > 0) {
      const files = apiData.files.map((f: any) => ({
        name: f.filename || f.name || 'Unknown',
        size: f.size || formatSize(f.size_bytes || 0),
        sizeBytes: f.size_bytes || 0,
        thumbnail: f.thumbnails?.original || f.thumbnail || '',
        isVideo: isVideoFile(f.filename || f.name || ''),
        dlink: f.download_link || f.dlink || '',
        fsId: String(f.fs_id || Math.random()),
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
      JSON.stringify({ success: false, error: 'Could not fetch video data' }),
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
