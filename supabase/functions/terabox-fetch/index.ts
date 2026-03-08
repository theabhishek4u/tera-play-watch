const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const APIS = [
  { name: 'ashlynn', url: (teraUrl: string) => `https://ashlynn.serv00.net/Ashlynnterabox.php/?url=${encodeURIComponent(teraUrl)}` },
  { name: 'darkhacker', url: (teraUrl: string) => `https://teraboxapi2.darkhacker7301.workers.dev/?url=${encodeURIComponent(teraUrl)}` },
  { name: 'tera-core', url: (teraUrl: string) => `https://tera-core.vercel.app/api2?url=${encodeURIComponent(teraUrl)}` },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return jsonRes({ success: false, error: 'URL is required' }, 400);
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
      return jsonRes({ success: false, error: 'Invalid URL' }, 400);
    }

    if (!surl) {
      return jsonRes({ success: false, error: 'Could not extract share code' }, 400);
    }

    console.log('Fetching for surl:', surl);

    // Try multiple APIs
    for (const api of APIS) {
      try {
        console.log(`Trying ${api.name}...`);
        const apiUrl = api.url(url.trim());
        const res = await fetch(apiUrl, {
          headers: { 'User-Agent': UA },
          signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
          console.log(`${api.name} returned ${res.status}`);
          continue;
        }

        const data = await res.json();
        const parsed = parseApiResponse(api.name, data, surl);

        if (parsed) {
          console.log(`${api.name} success! Files: ${parsed.files.length}`);
          return jsonRes({ success: true, data: parsed });
        }

        console.log(`${api.name} returned no usable data`);
      } catch (e) {
        console.log(`${api.name} error:`, e instanceof Error ? e.message : e);
      }
    }

    return jsonRes({ success: false, error: 'All APIs failed. Please try again later.' }, 400);

  } catch (error) {
    console.error('Error:', error);
    return jsonRes({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

function parseApiResponse(apiName: string, data: any, surl: string): { title: string; files: any[]; surl: string } | null {
  // Ashlynn / darkhacker format: { file_name, download_link, thumb, size, sizebytes }
  if (data?.file_name && data?.download_link) {
    return {
      title: data.file_name,
      files: [{
        name: data.file_name,
        size: data.size || formatSize(data.sizebytes || 0),
        sizeBytes: data.sizebytes || 0,
        thumbnail: data.thumb || '',
        isVideo: isVideoFile(data.file_name),
        dlink: data.download_link,
        fsId: String(Math.random()),
      }],
      surl,
    };
  }

  // Ashlynn/darkhacker alternate: { response: [{ resolutions: { ... }, thumbnail, file_name }] }
  if (data?.response?.length > 0) {
    const item = data.response[0];
    const resolutions = item.resolutions || {};
    // Get highest quality download link
    const dlink = resolutions['HD Video'] || resolutions['SD Video'] || resolutions['Fast Download'] || item.link || '';
    
    if (dlink && item.file_name) {
      return {
        title: item.file_name,
        files: [{
          name: item.file_name,
          size: item.size || '0',
          sizeBytes: item.sizebytes || 0,
          thumbnail: item.thumbnail || '',
          isVideo: isVideoFile(item.file_name),
          dlink,
          fsId: String(Math.random()),
        }],
        surl,
      };
    }
  }

  // tera-core format: { status: 'success', files: [...] }
  if (data?.status === 'success' && data?.files?.length > 0) {
    const files = data.files.map((f: any) => ({
      name: f.filename || f.name || 'Unknown',
      size: f.size || formatSize(f.size_bytes || 0),
      sizeBytes: f.size_bytes || 0,
      thumbnail: f.thumbnails?.original || f.thumbnail || '',
      isVideo: isVideoFile(f.filename || f.name || ''),
      dlink: f.download_link || f.dlink || '',
      fsId: String(f.fs_id || Math.random()),
    }));

    return {
      title: files[0]?.name || 'TeraBox File',
      files,
      surl,
    };
  }

  // Generic: look for download_link / dlink at top level
  if (data?.download_link || data?.dlink) {
    return {
      title: data.filename || data.file_name || data.name || 'TeraBox File',
      files: [{
        name: data.filename || data.file_name || data.name || 'TeraBox File',
        size: data.size || formatSize(data.size_bytes || data.sizebytes || 0),
        sizeBytes: data.size_bytes || data.sizebytes || 0,
        thumbnail: data.thumbnail || data.thumb || '',
        isVideo: isVideoFile(data.filename || data.file_name || ''),
        dlink: data.download_link || data.dlink,
        fsId: String(Math.random()),
      }],
      surl,
    };
  }

  return null;
}

function jsonRes(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

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
