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

    const surl = await extractSurl(url.trim());
    if (!surl) {
      return jsonRes({ success: false, error: 'Could not extract share code from URL' }, 400);
    }

    console.log('Fetching for surl:', surl);

    // PRIMARY: use ndus cookie with official TeraBox API
    const ndus = Deno.env.get('TERABOX_NDUS');
    if (ndus) {
      try {
        const direct = await fetchWithCookie(surl, ndus);
        if (direct) {
          console.log(`cookie path success! Files: ${direct.files.length}`);
          return jsonRes({ success: true, data: direct });
        }
      } catch (e) {
        console.log('cookie path failed:', e instanceof Error ? e.message : e);
      }
    } else {
      console.log('No TERABOX_NDUS cookie set — falling back to public APIs');
    }

    // FALLBACK: third-party APIs
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

async function extractSurl(rawUrl: string): Promise<string> {
  try {
    let u = new URL(rawUrl);
    // Follow shortener redirects (1024terabox, freeterabox short links)
    if (/\/s\/[A-Za-z0-9_-]+/.test(u.pathname) || u.searchParams.get('surl')) {
      let s = u.searchParams.get('surl') || '';
      if (!s) {
        const m = u.pathname.match(/\/s\/([A-Za-z0-9_-]+)/);
        if (m) s = m[1].startsWith('1') ? m[1].slice(1) : m[1];
      }
      if (s) return s;
    }
    // Follow redirect to resolve final URL
    const r = await fetch(rawUrl, { redirect: 'follow', headers: { 'User-Agent': UA } });
    const finalUrl = new URL(r.url);
    let s = finalUrl.searchParams.get('surl') || '';
    if (!s) {
      const m = finalUrl.pathname.match(/\/s\/([A-Za-z0-9_-]+)/);
      if (m) s = m[1].startsWith('1') ? m[1].slice(1) : m[1];
    }
    return s;
  } catch {
    return '';
  }
}

async function fetchWithCookie(surl: string, ndus: string): Promise<{ title: string; files: any[]; surl: string } | null> {
  const cookie = `ndus=${ndus}`;
  const baseHeaders = {
    'User-Agent': UA,
    'Cookie': cookie,
    'Referer': 'https://www.terabox.com/',
    'Accept': 'application/json, text/plain, */*',
  };

  // 1) shorturlinfo to get shareid + uk + file list
  const infoUrl = `https://www.terabox.com/api/shorturlinfo?app_id=250528&shorturl=1${surl}&root=1`;
  const infoRes = await fetch(infoUrl, { headers: baseHeaders });
  if (!infoRes.ok) throw new Error(`shorturlinfo ${infoRes.status}`);
  const info = await infoRes.json();
  console.log('shorturlinfo errno:', info?.errno);
  if (info?.errno !== 0 || !info?.list?.length) {
    throw new Error(`shorturlinfo errno ${info?.errno}`);
  }

  const shareid = info.shareid;
  const uk = info.uk;
  const sign = info.sign;
  const timestamp = info.timestamp;

  const files: any[] = [];
  for (const item of info.list) {
    let dlink = '';
    try {
      // 2) get real download link
      const dlUrl = `https://www.terabox.com/share/download?app_id=250528&channel=dubox&clienttype=0&web=1&sign=${encodeURIComponent(sign)}&timestamp=${timestamp}`;
      const body = `encrypt=0&product=share&uk=${uk}&primaryid=${shareid}&fid_list=%5B${item.fs_id}%5D`;
      const dlRes = await fetch(dlUrl, {
        method: 'POST',
        headers: { ...baseHeaders, 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      const dlData = await dlRes.json();
      dlink = dlData?.list?.[0]?.dlink || '';
      console.log('share/download errno:', dlData?.errno, 'has dlink:', !!dlink);
    } catch (e) {
      console.log('share/download error', e instanceof Error ? e.message : e);
    }

    files.push({
      name: item.server_filename || 'Unknown',
      size: formatSize(Number(item.size) || 0),
      sizeBytes: Number(item.size) || 0,
      thumbnail: item.thumbs?.url3 || item.thumbs?.url2 || item.thumbs?.url1 || '',
      isVideo: isVideoFile(item.server_filename || ''),
      dlink,
      fsId: String(item.fs_id),
    });
  }

  if (!files.some(f => f.dlink)) return null;

  return {
    title: info.title || files[0]?.name || 'TeraBox File',
    files,
    surl,
  };
}

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
