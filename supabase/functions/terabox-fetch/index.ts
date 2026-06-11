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
        const direct = await fetchWithShareList(url.trim(), surl, ndus);
        if (direct) {
          console.log(`share-list success! Files: ${direct.files.length}`);
          return jsonRes({ success: true, data: direct });
        }
      } catch (e) {
        console.log('share-list failed:', e instanceof Error ? e.message : e);
      }
      try {
        const direct = await fetchFromSharePage(url.trim(), surl, ndus);
        if (direct) {
          console.log(`share-page success! Files: ${direct.files.length}`);
          return jsonRes({ success: true, data: direct });
        }
      } catch (e) {
        console.log('share-page failed:', e instanceof Error ? e.message : e);
      }
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

    return jsonRes({
      success: false,
      fallback: true,
      error: 'TeraBox could not generate a playable link right now. The saved TeraBox login session may be expired, or this share link may be private/deleted/password-protected.',
      code: 'TERABOX_LINK_FETCH_FAILED',
    });

  } catch (error) {
    console.error('Error:', error);
    return jsonRes({
      success: false,
      fallback: true,
      error: error instanceof Error ? error.message : 'Unknown error',
      code: 'TERABOX_FUNCTION_ERROR',
    });
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
  return _fetchWithCookieImpl(surl, ndus);
}

async function fetchWithShareList(rawUrl: string, surl: string, ndus: string): Promise<{ title: string; files: any[]; surl: string } | null> {
  const cookie = makeTeraCookie(ndus);
  const shorturl = surl.startsWith('1') ? surl.slice(1) : surl;
  const pageUrl = `https://dm.terabox.app/sharing/link?surl=${encodeURIComponent(surl)}`;
  const pageRes = await fetch(pageUrl, {
    headers: {
      'User-Agent': UA,
      'Cookie': cookie,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.terabox.app/',
    },
    redirect: 'follow',
  });

  if (!pageRes.ok) throw new Error(`share landing ${pageRes.status}`);
  const html = await pageRes.text();
  const jsToken = extractJsToken(html);
  console.log('share-list token found:', !!jsToken, 'html len=', html.length);

  const params = new URLSearchParams({
    app_id: '250528',
    web: '1',
    channel: 'share',
    clienttype: '0',
    shorturl,
    root: '1',
  });
  if (jsToken) params.set('jsToken', jsToken);
  params.set('site_referer', 'https://www.terabox.app/');

  const listUrl = `https://dm.terabox.app/share/list?${params.toString()}`;
  const listRes = await fetch(listUrl, {
    headers: {
      'User-Agent': UA,
      'Cookie': cookie,
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': `${pageUrl}&clearCache=1`,
      'Origin': 'https://dm.terabox.app',
    },
  });
  if (!listRes.ok) throw new Error(`share/list ${listRes.status}`);
  const listData = await listRes.json();
  console.log('share/list errno:', listData?.errno, 'files:', listData?.list?.length || 0, 'errmsg:', listData?.errmsg || '');

  if (listData?.errno !== 0 || !listData?.list?.length) return null;
  const files = buildFilesFromList(listData.list, shorturl, listData);
  const firstFile = firstLeafFile(files);
  if (firstFile) await hydrateDlink(firstFile, listData, cookie, rawUrl, jsToken);
  if (!files.some(f => f.dlink)) return null;

  return { title: listData.title || files[0]?.name || 'TeraBox File', files, surl: shorturl };
}

async function fetchFromSharePage(rawUrl: string, surl: string, ndus: string): Promise<{ title: string; files: any[]; surl: string } | null> {
  const cookie = makeTeraCookie(ndus);

  const headers = {
    'User-Agent': UA,
    'Cookie': cookie,
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  const res = await fetch(rawUrl, { headers, redirect: 'follow' });
  if (!res.ok) throw new Error(`share page ${res.status}`);
  const html = await res.text();

  // Extract yunData (TeraBox embeds page state as JS object)
  const yunMatch = html.match(/yunData\s*=\s*(\{[\s\S]*?\});?\s*(?:<\/script>|var\s|window\.)/);
  if (!yunMatch) {
    console.log('yunData not found in HTML (len=', html.length, ')');
    throw new Error('yunData not found — link may need login or page changed');
  }
  let yunData: any;
  try {
    yunData = JSON.parse(yunMatch[1]);
  } catch (e) {
    throw new Error('yunData parse failed');
  }

  const shareid = yunData.SHARE_ID || yunData.shareid;
  const uk = yunData.SHARE_UK || yunData.share_uk || yunData.uk;
  const sign = yunData.SIGN || yunData.sign;
  const timestamp = yunData.TIMESTAMP || yunData.timestamp;
  const jsToken = yunData.MYJSTOKEN || yunData.jsToken;
  const fileList: any[] = yunData.FILEINFO || yunData.file_list || [];

  console.log('yunData parsed: shareid=', !!shareid, 'uk=', !!uk, 'sign=', !!sign, 'files=', fileList.length);

  if (!fileList.length || !shareid || !uk || !sign) {
    throw new Error('yunData missing required fields');
  }

  const baseHeaders = {
    'User-Agent': UA,
    'Cookie': cookie,
    'Referer': rawUrl,
    'Accept': 'application/json, text/plain, */*',
  };

  const files: any[] = [];
  for (const item of fileList) {
    let dlink = item.dlink || '';
    if (!dlink) {
      try {
        const dlUrl = `https://www.terabox.com/share/download?app_id=250528&channel=dubox&clienttype=0&web=1&sign=${encodeURIComponent(sign)}&timestamp=${timestamp}${jsToken ? `&jsToken=${encodeURIComponent(jsToken)}` : ''}`;
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
    }

    files.push({
      name: item.server_filename || item.filename || 'Unknown',
      size: formatSize(Number(item.size) || 0),
      sizeBytes: Number(item.size) || 0,
      thumbnail: item.thumbs?.url3 || item.thumbs?.url2 || item.thumbs?.url1 || '',
      isVideo: isVideoFile(item.server_filename || item.filename || ''),
      dlink,
      fsId: String(item.fs_id),
    });
  }

  if (!files.some(f => f.dlink)) return null;
  return { title: files[0]?.name || 'TeraBox File', files, surl };
}

async function _fetchWithCookieImpl(surl: string, ndus: string): Promise<{ title: string; files: any[]; surl: string } | null> {
  // Sanitize: user may have pasted "ndus=VALUE" or wrapped in quotes
  let ndusVal = ndus.trim().replace(/^['"]|['"]$/g, '');
  if (ndusVal.toLowerCase().startsWith('ndus=')) ndusVal = ndusVal.slice(5);
  ndusVal = ndusVal.split(';')[0].trim();
  const cookie = `ndus=${ndusVal}; lang=en;`;
  const baseHeaders = {
    'User-Agent': UA,
    'Cookie': cookie,
    'Referer': 'https://www.terabox.com/',
    'Accept': 'application/json, text/plain, */*',
  };

  // 1) shorturlinfo — try multiple host + shorturl format combos
  const hosts = ['https://www.terabox.com', 'https://www.terabox.app', 'https://dm.terabox.app', 'https://www.1024tera.com'];
  const shorturlVariants = [surl.startsWith('1') ? surl : `1${surl}`, surl];
  let info: any = null;
  for (const host of hosts) {
    for (const sv of shorturlVariants) {
      try {
        const infoUrl = `${host}/api/shorturlinfo?app_id=250528&web=1&channel=dubox&clienttype=0&shorturl=${encodeURIComponent(sv)}&root=1`;
        const r = await fetch(infoUrl, { headers: { ...baseHeaders, Referer: host + '/' } });
        if (!r.ok) { console.log(`shorturlinfo ${host} ${sv} http ${r.status}`); continue; }
        const d = await r.json();
        console.log(`shorturlinfo ${host} sv=${sv} errno=${d?.errno} files=${d?.list?.length || 0}`);
        if (d?.errno === 0 && d?.list?.length) { info = d; break; }
      } catch (e) {
        console.log('shorturlinfo error', e instanceof Error ? e.message : e);
      }
    }
    if (info) break;
  }
  if (!info) throw new Error('shorturlinfo: all variants rejected (check ndus cookie validity)');

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
