const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// All known TeraBox domains for URL validation and API calls
const TERABOX_DOMAINS = [
  'terabox.com', 'terabox.app', 'dm.terabox.app',
  '1024tera.com', '1024terabox.com',
  'freeterabox.com', 'teraboxlink.com', 'teraboxshare.com',
  '4funbox.com', 'mirrobox.com', 'nephobox.com',
  'momerybox.com', 'tibibox.com',
];

// TeraBox API hosts to try (in priority order)
const API_HOSTS = [
  'https://www.terabox.app',
  'https://dm.terabox.app',
  'https://www.terabox.com',
  'https://www.1024tera.com',
];

// Updated third-party fallback APIs (replaces dead ones)
const APIS = [
  {
    name: 'teraboxvideodownloader',
    fetch: async (teraUrl: string) => {
      const res = await fetch('https://teraboxvideodownloader.com/api/get-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
        body: JSON.stringify({ url: teraUrl }),
        signal: AbortSignal.timeout(15000),
      });
      return res;
    },
  },
  {
    name: 'ytshorts-savetube',
    fetch: async (teraUrl: string) => {
      const res = await fetch('https://ytshorts.savetube.me/api/v1/terabox-downloader', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
        body: JSON.stringify({ url: teraUrl }),
        signal: AbortSignal.timeout(15000),
      });
      return res;
    },
  },
  {
    name: 'teraboxapp-dl1',
    fetch: async (teraUrl: string) => {
      const res = await fetch(`https://teraboxapp.com/api/get-info?data=${encodeURIComponent(teraUrl)}`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(15000),
      });
      return res;
    },
  },
  {
    name: 'terabox-dl-api',
    fetch: async (teraUrl: string) => {
      const res = await fetch(`https://api.terabox-dl.com/dl?url=${encodeURIComponent(teraUrl)}`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(15000),
      });
      return res;
    },
  },
  {
    name: 'teradl-worker',
    fetch: async (teraUrl: string) => {
      const res = await fetch(`https://teradl-api.darkhacker7301.workers.dev/?url=${encodeURIComponent(teraUrl)}`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(15000),
      });
      return res;
    },
  },
];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return jsonRes({ success: false, error: 'URL is required' }, 400);
    }

    // Validate URL contains a known TeraBox domain
    const isValid = TERABOX_DOMAINS.some(d => url.includes(d));
    if (!isValid) {
      return jsonRes({ success: false, error: 'Please enter a valid TeraBox URL.' }, 400);
    }

    const surl = await extractSurl(url.trim());
    if (!surl) {
      return jsonRes({ success: false, error: 'Could not extract share code from URL. Make sure the link is a valid public share link.' }, 400);
    }

    console.log('Fetching for surl:', surl);

    // ─── PRIMARY: use ndus cookie with official TeraBox API ───
    const ndus = Deno.env.get('TERABOX_NDUS');
    if (ndus) {
      console.log('TERABOX_NDUS cookie found, trying cookie-based methods...');

      // Method 1: share/list API
      try {
        const direct = await fetchWithShareList(url.trim(), surl, ndus);
        if (direct) {
          console.log(`share-list success! Files: ${direct.files.length}`);
          return jsonRes({ success: true, data: direct });
        }
      } catch (e) {
        console.log('share-list failed:', e instanceof Error ? e.message : e);
      }

      // Method 2: share page HTML scraping (with cookie)
      try {
        const direct = await fetchFromSharePage(url.trim(), surl, ndus);
        if (direct) {
          console.log(`share-page success! Files: ${direct.files.length}`);
          return jsonRes({ success: true, data: direct });
        }
      } catch (e) {
        console.log('share-page failed:', e instanceof Error ? e.message : e);
      }

      // Method 3: shorturlinfo + share/download (with cookie)
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
      console.log('No TERABOX_NDUS cookie set — trying public scrape then fallback APIs');
    }

    // ─── SECONDARY: public page scrape (no cookie) ───
    try {
      console.log('Trying public page scrape (no cookie)...');
      const scraped = await fetchFromSharePagePublic(url.trim(), surl);
      if (scraped) {
        console.log(`public scrape success! Files: ${scraped.files.length}`);
        return jsonRes({ success: true, data: scraped });
      }
    } catch (e) {
      console.log('public scrape failed:', e instanceof Error ? e.message : e);
    }

    // ─── TERTIARY: third-party fallback APIs ───
    for (const api of APIS) {
      try {
        console.log(`Trying ${api.name}...`);
        const res = await api.fetch(url.trim());

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

    // ─── ALL METHODS FAILED ───
    const hasCookie = !!ndus;
    return jsonRes({
      success: false,
      fallback: true,
      error: hasCookie
        ? 'Could not fetch video. Your TeraBox session cookie (NDUS) may have expired. Please refresh the cookie in Supabase secrets and try again. The link may also be private/deleted/password-protected.'
        : 'Could not fetch video. No TeraBox session cookie (NDUS) is configured. Set the TERABOX_NDUS secret in Supabase for reliable operation. The link may also be private/deleted/password-protected.',
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

// ═══════════════════════════════════════════════════
// URL / surl extraction
// ═══════════════════════════════════════════════════

async function extractSurl(rawUrl: string): Promise<string> {
  try {
    let u = new URL(rawUrl);
    // Try to get surl directly from URL params or path
    if (/\/s\/[A-Za-z0-9_-]+/.test(u.pathname) || u.searchParams.get('surl')) {
      let s = u.searchParams.get('surl') || '';
      if (!s) {
        const m = u.pathname.match(/\/s\/([A-Za-z0-9_-]+)/);
        if (m) s = m[1].startsWith('1') ? m[1].slice(1) : m[1];
      }
      if (s) return s;
    }
    // Handle /wap/share/filelist?surl= format
    if (u.pathname.includes('/wap/share/filelist') || u.pathname.includes('/sharing/link')) {
      const s = u.searchParams.get('surl');
      if (s) return s.startsWith('1') ? s.slice(1) : s;
    }
    // Follow redirect to resolve final URL
    const r = await fetch(rawUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10000),
    });
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

// ═══════════════════════════════════════════════════
// Cookie helpers
// ═══════════════════════════════════════════════════

function makeTeraCookie(ndus: string): string {
  let ndusVal = ndus.trim().replace(/^['"]|['"]$/g, '');
  if (ndusVal.toLowerCase().startsWith('ndus=')) ndusVal = ndusVal.slice(5);
  ndusVal = ndusVal.split(';')[0].trim();
  return ndusVal ? `lang=en; ndus=${ndusVal};` : 'lang=en;';
}

function extractJsToken(html: string): string {
  const patterns = [
    /fn%28%22([^%"]+)%22%29/,
    /fn\("([^"]+)"\)/,
    /jsToken["']?\s*[:=]\s*["']([^"']+)["']/,
    /MYJSTOKEN["']?\s*[:=]\s*["']([^"']+)["']/,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return '';
}

// ═══════════════════════════════════════════════════
// Method 1: share/list API (with cookie)
// ═══════════════════════════════════════════════════

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
    signal: AbortSignal.timeout(15000),
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
    signal: AbortSignal.timeout(15000),
  });
  if (!listRes.ok) throw new Error(`share/list ${listRes.status}`);
  const listData = await listRes.json();
  console.log('share/list errno:', listData?.errno, 'files:', listData?.list?.length || 0, 'errmsg:', listData?.errmsg || '');

  if (listData?.errno !== 0 || !listData?.list?.length) return null;
  const files = await collectShareFiles(shorturl, listData, cookie, pageUrl, jsToken, listData.list);
  console.log('share/list flattened files:', files.length, 'videos:', files.filter((f: any) => f.isVideo).length);
  for (const file of files.filter((f: any) => !f.isDir && !f.dlink)) {
    await hydrateDlink(file, listData, cookie, rawUrl, jsToken);
  }
  if (!files.some((f: any) => f.dlink)) return null;

  return { title: listData.title || files[0]?.name || 'TeraBox File', files, surl: shorturl };
}

async function collectShareFiles(shorturl: string, source: any, cookie: string, pageUrl: string, jsToken: string, list: any[], depth = 0): Promise<any[]> {
  const files = buildFilesFromList(list, shorturl, source);
  const flattened: any[] = [];
  for (const file of files) {
    if (file.isDir && file.path && depth < 4) {
      const params = new URLSearchParams({
        app_id: '250528',
        web: '1',
        channel: 'share',
        clienttype: '0',
        shorturl,
        root: '0',
        dir: file.path,
        page: '1',
        num: '100',
        order: 'name',
        desc: '0',
        site_referer: 'https://www.terabox.app/',
      });
      if (jsToken) params.set('jsToken', jsToken);
      const childRes = await fetch(`https://dm.terabox.app/share/list?${params.toString()}`, {
        headers: {
          'User-Agent': UA,
          'Cookie': cookie,
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': `${pageUrl}&clearCache=1`,
          'Origin': 'https://dm.terabox.app',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!childRes.ok) continue;
      const childData = await childRes.json();
      console.log('share/list dir:', file.path, 'errno:', childData?.errno, 'files:', childData?.list?.length || 0);
      if (childData?.errno === 0 && childData?.list?.length) {
        flattened.push(...await collectShareFiles(shorturl, source, cookie, pageUrl, jsToken, childData.list, depth + 1));
      }
    } else {
      flattened.push(file);
    }
  }
  return flattened;
}

// ═══════════════════════════════════════════════════
// Method 2: Share page HTML scraping (with cookie)
// ═══════════════════════════════════════════════════

async function fetchFromSharePage(rawUrl: string, surl: string, ndus: string): Promise<{ title: string; files: any[]; surl: string } | null> {
  const cookie = makeTeraCookie(ndus);

  const headers = {
    'User-Agent': UA,
    'Cookie': cookie,
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  const res = await fetch(rawUrl, { headers, redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`share page ${res.status}`);
  const html = await res.text();

  // Extract yunData (TeraBox embeds page state as JS object)
  const yunMatch = html.match(/yunData\s*=\s*(\{[\s\S]*?\});?\s*(?:<\/script>|var\s|window\.)/);
  if (!yunMatch) {
    console.log('yunData not found in HTML (len=', html.length, '), trying file_list parser');
    const parsed = parseShareParamsFromHtml(html);
    if (!parsed) throw new Error('share parameters not found — link may need login or page changed');
    const files = buildFilesFromList(parsed.fileList, surl, parsed);
    for (const file of files.filter((f: any) => !f.isDir && !f.dlink)) {
      await hydrateDlink(file, parsed, cookie, rawUrl, parsed.jsToken || '');
    }
    if (!files.some((f: any) => f.dlink)) return null;
    return { title: files[0]?.name || 'TeraBox File', files, surl };
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
          signal: AbortSignal.timeout(15000),
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

// ═══════════════════════════════════════════════════
// Method 2b: Public page scrape (NO cookie)
// ═══════════════════════════════════════════════════

async function fetchFromSharePagePublic(rawUrl: string, surl: string): Promise<{ title: string; files: any[]; surl: string } | null> {
  // Try multiple TeraBox hosts for the share page
  const urls = [
    rawUrl,
    `https://www.terabox.app/s/1${surl}`,
    `https://dm.terabox.app/sharing/link?surl=${surl}`,
    `https://www.1024tera.com/s/1${surl}`,
    `https://www.terabox.com/s/1${surl}`,
  ];

  for (const tryUrl of urls) {
    try {
      console.log('Public scrape trying:', tryUrl.substring(0, 60));
      const res = await fetch(tryUrl, {
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cookie': 'lang=en;',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) {
        console.log('Public scrape', tryUrl.substring(0, 40), 'returned', res.status);
        continue;
      }

      const html = await res.text();
      console.log('Public scrape HTML len:', html.length);

      // Try yunData extraction
      const yunMatch = html.match(/yunData\s*=\s*(\{[\s\S]*?\});?\s*(?:<\/script>|var\s|window\.)/);
      if (yunMatch) {
        try {
          const yunData = JSON.parse(yunMatch[1]);
          const fileList: any[] = yunData.FILEINFO || yunData.file_list || [];
          if (fileList.length > 0) {
            const files = fileList.map((item: any) => ({
              name: item.server_filename || item.filename || 'Unknown',
              size: formatSize(Number(item.size) || 0),
              sizeBytes: Number(item.size) || 0,
              thumbnail: item.thumbs?.url3 || item.thumbs?.url2 || item.thumbs?.url1 || '',
              isVideo: isVideoFile(item.server_filename || item.filename || ''),
              dlink: item.dlink || '',
              fsId: String(item.fs_id || Math.random()),
            }));
            if (files.some((f: any) => f.dlink)) {
              return { title: files[0]?.name || 'TeraBox File', files, surl };
            }
          }
        } catch {
          console.log('yunData parse failed for public scrape');
        }
      }

      // Try file_list parser fallback
      const parsed = parseShareParamsFromHtml(html);
      if (parsed && parsed.fileList?.length > 0) {
        const files = buildFilesFromList(parsed.fileList, surl, parsed);
        if (files.some((f: any) => f.dlink)) {
          return { title: files[0]?.name || 'TeraBox File', files, surl };
        }
      }

      // Try to extract direct video link from embedded player
      const videoMatch = html.match(/videoUrl\s*[:=]\s*["']([^"']+)["']/) ||
                         html.match(/stream_url\s*[:=]\s*["']([^"']+)["']/) ||
                         html.match(/"dlink"\s*:\s*"([^"]+)"/) ||
                         html.match(/play_url\s*[:=]\s*["']([^"']+)["']/);
      const titleMatch = html.match(/<title>([^<]+)<\/title>/) ||
                         html.match(/server_filename\s*[:=]\s*["']([^"']+)["']/);

      if (videoMatch?.[1]) {
        const dlink = videoMatch[1].replace(/\\\//g, '/');
        const name = titleMatch?.[1]?.replace(/ - TeraBox.*$/i, '').trim() || 'TeraBox Video';
        return {
          title: name,
          files: [{
            name,
            size: '0',
            sizeBytes: 0,
            thumbnail: '',
            isVideo: true,
            dlink,
            fsId: String(Math.random()),
          }],
          surl,
        };
      }
    } catch (e) {
      console.log('Public scrape error for', tryUrl.substring(0, 40), ':', e instanceof Error ? e.message : e);
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════
// Method 3: shorturlinfo + share/download (with cookie)
// ═══════════════════════════════════════════════════

async function fetchWithCookie(surl: string, ndus: string): Promise<{ title: string; files: any[]; surl: string } | null> {
  return _fetchWithCookieImpl(surl, ndus);
}

async function _fetchWithCookieImpl(surl: string, ndus: string): Promise<{ title: string; files: any[]; surl: string } | null> {
  const cookie = makeTeraCookie(ndus);
  const baseHeaders = {
    'User-Agent': UA,
    'Cookie': cookie,
    'Referer': 'https://www.terabox.com/',
    'Accept': 'application/json, text/plain, */*',
  };

  // 1) shorturlinfo — try multiple host + shorturl format combos
  const shorturlVariants = [surl.startsWith('1') ? surl : `1${surl}`, surl];
  let info: any = null;
  for (const host of API_HOSTS) {
    for (const sv of shorturlVariants) {
      try {
        const infoUrl = `${host}/api/shorturlinfo?app_id=250528&web=1&channel=dubox&clienttype=0&shorturl=${encodeURIComponent(sv)}&root=1`;
        const r = await fetch(infoUrl, {
          headers: { ...baseHeaders, Referer: host + '/' },
          signal: AbortSignal.timeout(12000),
        });
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
        signal: AbortSignal.timeout(15000),
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

// ═══════════════════════════════════════════════════
// Shared helpers
// ═══════════════════════════════════════════════════

function buildFilesFromList(list: any[], surl: string, source: any): any[] {
  return list.map((item: any) => ({
    name: item.server_filename || item.filename || item.name || 'Unknown',
    size: formatSize(Number(item.size) || 0),
    sizeBytes: Number(item.size) || 0,
    thumbnail: item.thumbs?.url3 || item.thumbs?.url2 || item.thumbs?.url1 || item.thumb || '',
    isVideo: isVideoFile(item.server_filename || item.filename || item.name || ''),
    dlink: item.dlink || '',
    fsId: String(item.fs_id || item.fsId || Math.random()),
    path: item.path || '',
    isDir: String(item.isdir || item.isDir || '0') === '1',
    shareid: source.shareid || source.share_id || source.shareId,
    uk: source.uk,
    sign: source.sign,
    timestamp: source.timestamp,
    surl,
  }));
}

function parseShareParamsFromHtml(html: string): any | null {
  const script = html.match(/<script[^>]*>([\s\S]*?file_list[\s\S]*?)<\/script>/)?.[1] || html;
  const fileListMatch = script.match(/"file_list"\s*:\s*(\[[\s\S]*?\])\s*,\s*"(?:shareid|share_id|uk|sign|timestamp)"/)
    || script.match(/"file_list"\s*:\s*(\[[\s\S]*?\])/);
  const shareIdMatch = script.match(/"shareid"\s*:\s*"?([^",}]+)"?/) || script.match(/"share_id"\s*:\s*"?([^",}]+)"?/);
  const ukMatch = script.match(/"uk"\s*:\s*"?([^",}]+)"?/);
  const signMatch = script.match(/"sign"\s*:\s*"([^"]+)"/);
  const timestampMatch = script.match(/"timestamp"\s*:\s*"?([^",}]+)"?/);
  if (!fileListMatch || !shareIdMatch || !ukMatch || !signMatch || !timestampMatch) return null;
  try {
    return {
      shareid: shareIdMatch[1],
      uk: ukMatch[1],
      sign: signMatch[1],
      timestamp: timestampMatch[1],
      jsToken: extractJsToken(html),
      fileList: JSON.parse(fileListMatch[1]),
    };
  } catch {
    return null;
  }
}

async function hydrateDlink(file: any, source: any, cookie: string, rawUrl: string, jsToken = '') {
  const shareid = file.shareid || source.shareid || source.share_id || source.shareId;
  const uk = file.uk || source.uk;
  const sign = file.sign || source.sign;
  const timestamp = file.timestamp || source.timestamp;
  if (!shareid || !uk || !sign || !timestamp || !file.fsId) return;

  const params = new URLSearchParams({
    app_id: '250528',
    web: '1',
    channel: 'share',
    clienttype: '0',
    shareid: String(shareid),
    uk: String(uk),
    sign: String(sign),
    timestamp: String(timestamp),
    fid_list: `[${file.fsId}]`,
    operation: 'download',
  });
  if (jsToken) params.set('jsToken', jsToken);

  const apiRes = await fetch(`https://www.terabox.app/share/list?${params.toString()}`, {
    headers: {
      'User-Agent': UA,
      'Cookie': cookie,
      'Accept': 'application/json, text/plain, */*',
      'Referer': rawUrl,
      'Origin': 'https://www.terabox.app',
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!apiRes.ok) return;
  const apiData = await apiRes.json();
  file.dlink = apiData?.list?.[0]?.dlink || file.dlink || '';
  console.log('share/list download errno:', apiData?.errno, 'has dlink:', !!file.dlink);
}

// ═══════════════════════════════════════════════════
// Third-party API response parsers
// ═══════════════════════════════════════════════════

function parseApiResponse(apiName: string, data: any, surl: string): { title: string; files: any[]; surl: string } | null {
  // Format: { file_name, download_link, thumb, size, sizebytes }
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

  // Format: { response: [{ resolutions: { ... }, thumbnail, file_name }] }
  if (data?.response?.length > 0) {
    const item = data.response[0];
    const resolutions = item.resolutions || {};
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

  // Format: { status: 'success', files: [...] }  OR  { ok: true, data: { files: [...] } }
  const fileArray = data?.files || data?.data?.files || data?.result?.files;
  if ((data?.status === 'success' || data?.ok || data?.success) && fileArray?.length > 0) {
    const files = fileArray.map((f: any) => ({
      name: f.filename || f.file_name || f.name || 'Unknown',
      size: f.size || formatSize(f.size_bytes || f.sizebytes || 0),
      sizeBytes: f.size_bytes || f.sizebytes || 0,
      thumbnail: f.thumbnails?.original || f.thumbnail || f.thumb || '',
      isVideo: isVideoFile(f.filename || f.file_name || f.name || ''),
      dlink: f.download_link || f.dlink || f.url || '',
      fsId: String(f.fs_id || Math.random()),
    }));

    return {
      title: files[0]?.name || 'TeraBox File',
      files,
      surl,
    };
  }

  // Generic: look for download_link / dlink at top level
  if (data?.download_link || data?.dlink || data?.url) {
    return {
      title: data.filename || data.file_name || data.name || data.title || 'TeraBox File',
      files: [{
        name: data.filename || data.file_name || data.name || data.title || 'TeraBox File',
        size: data.size || formatSize(data.size_bytes || data.sizebytes || 0),
        sizeBytes: data.size_bytes || data.sizebytes || 0,
        thumbnail: data.thumbnail || data.thumb || '',
        isVideo: isVideoFile(data.filename || data.file_name || ''),
        dlink: data.download_link || data.dlink || data.url,
        fsId: String(Math.random()),
      }],
      surl,
    };
  }

  // Nested data object: { data: { download_link, file_name, ... } }
  if (data?.data?.download_link || data?.data?.dlink) {
    const d = data.data;
    return {
      title: d.filename || d.file_name || d.name || 'TeraBox File',
      files: [{
        name: d.filename || d.file_name || d.name || 'TeraBox File',
        size: d.size || formatSize(d.size_bytes || d.sizebytes || 0),
        sizeBytes: d.size_bytes || d.sizebytes || 0,
        thumbnail: d.thumbnail || d.thumb || '',
        isVideo: isVideoFile(d.filename || d.file_name || ''),
        dlink: d.download_link || d.dlink,
        fsId: String(Math.random()),
      }],
      surl,
    };
  }

  return null;
}

// ═══════════════════════════════════════════════════
// Utility functions
// ═══════════════════════════════════════════════════

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

export {};

