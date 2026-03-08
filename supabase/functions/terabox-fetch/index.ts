const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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

    console.log('Fetching fresh data for surl:', surl);

    // Step 1: Fetch the share page to get jsToken and cookies
    const pageUrl = `https://www.terabox.app/wap/share/filelist?surl=${surl}`;
    console.log('Fetching page:', pageUrl);
    
    const pageRes = await fetch(pageUrl, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });

    const pageHtml = await pageRes.text();
    
    // Extract cookies from response
    const cookies = pageRes.headers.getSetCookie?.() || [];
    const cookieStr = cookies.map(c => c.split(';')[0]).join('; ');
    console.log('Got cookies:', cookieStr ? 'yes' : 'no');

    // Extract jsToken from page
    const jsTokenMatch = pageHtml.match(/fn%28%22(.*?)%22%29/) || 
                         pageHtml.match(/jsToken.*?=.*?"(.*?)"/) ||
                         pageHtml.match(/window\.jsToken\s*=\s*"(.*?)"/) ||
                         pageHtml.match(/"jsToken"\s*:\s*"(.*?)"/);
    
    let jsToken = '';
    if (jsTokenMatch) {
      jsToken = decodeURIComponent(jsTokenMatch[1] || jsTokenMatch[0]);
      console.log('Found jsToken:', jsToken.slice(0, 20) + '...');
    } else {
      console.log('jsToken not found in page, trying alternative extraction...');
      // Try to find it in a different format
      const fnMatch = pageHtml.match(/fn\("([^"]+)"\)/);
      if (fnMatch) {
        jsToken = fnMatch[1];
        console.log('Found jsToken via fn():', jsToken.slice(0, 20) + '...');
      }
    }

    // Extract other data from the page (look for window.__INITIAL_STATE__ or similar)
    const dataMatch = pageHtml.match(/window\.__INITIAL_STATE__\s*=\s*({.*?});/) ||
                      pageHtml.match(/"shareid"\s*:\s*(\d+).*?"uk"\s*:\s*(\d+)/);

    let shareid = '', uk = '', sign = '', timestamp = '';
    
    const shareidMatch = pageHtml.match(/"shareid"\s*:\s*(\d+)/);
    const ukMatch = pageHtml.match(/"uk"\s*:\s*(\d+)/);
    const signMatch = pageHtml.match(/"sign"\s*:\s*"([^"]+)"/);
    const timestampMatch = pageHtml.match(/"timestamp"\s*:\s*(\d+)/);

    if (shareidMatch) shareid = shareidMatch[1];
    if (ukMatch) uk = ukMatch[1];
    if (signMatch) sign = signMatch[1];
    if (timestampMatch) timestamp = timestampMatch[1];

    console.log('Extracted: shareid=', shareid, 'uk=', uk, 'sign=', sign ? 'yes' : 'no');

    // Step 2: Use TeraBox API with jsToken to get file list
    const apiHeaders: Record<string, string> = {
      'User-Agent': UA,
      'Accept': 'application/json',
      'Referer': `https://www.terabox.app/wap/share/filelist?surl=${surl}`,
    };
    if (cookieStr) apiHeaders['Cookie'] = cookieStr;

    let fileList: any[] = [];

    // Try using shorturlinfo API with cookies
    const infoUrl = `https://www.terabox.app/api/shorturlinfo?app_id=250528&shorturl=${encodeURIComponent(surl)}&root=1`;
    console.log('Fetching file info with cookies...');
    
    const infoRes = await fetch(infoUrl, { headers: apiHeaders });
    const infoData = await infoRes.json();
    
    console.log('shorturlinfo errno:', infoData.errno);

    if (infoData.errno === 0 && infoData.list?.length > 0) {
      shareid = shareid || String(infoData.shareid || '');
      uk = uk || String(infoData.uk || '');
      sign = sign || infoData.sign || '';
      timestamp = timestamp || String(infoData.timestamp || '');
      fileList = infoData.list;
    }

    if (fileList.length === 0) {
      // Try alternative domain
      const altInfoUrl = `https://www.1024tera.com/api/shorturlinfo?app_id=250528&shorturl=${encodeURIComponent(surl)}&root=1`;
      const altRes = await fetch(altInfoUrl, { headers: { ...apiHeaders, 'Referer': 'https://www.1024tera.com/' } });
      const altData = await altRes.json();
      console.log('alt shorturlinfo errno:', altData.errno);
      
      if (altData.errno === 0 && altData.list?.length > 0) {
        shareid = String(altData.shareid || '');
        uk = String(altData.uk || '');
        sign = altData.sign || '';
        timestamp = String(altData.timestamp || '');
        fileList = altData.list;
      }
    }

    if (fileList.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Could not fetch files. The link may be expired or invalid.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 3: Get fresh download links
    const fsIds = fileList.map((f: any) => f.fs_id);
    
    let downloadLinks: Record<string, string> = {};
    
    if (shareid && uk && sign && timestamp) {
      const dlUrl = `https://www.terabox.app/api/sharedownload?app_id=250528&shareid=${shareid}&uk=${uk}&sign=${sign}&timestamp=${timestamp}&fid_list=[${fsIds.join(',')}]`;
      console.log('Fetching download links...');
      
      const dlRes = await fetch(dlUrl, { headers: apiHeaders });
      const dlData = await dlRes.json();
      console.log('sharedownload errno:', dlData.errno);
      
      if (dlData.errno === 0 && dlData.list) {
        dlData.list.forEach((item: any) => {
          if (item.dlink) {
            downloadLinks[String(item.fs_id)] = item.dlink;
          }
        });
      }
    }

    // Build response
    const files = fileList.map((f: any) => ({
      name: f.server_filename || 'Unknown',
      size: formatSize(f.size || 0),
      sizeBytes: f.size || 0,
      thumbnail: f.thumbs?.url3 || f.thumbs?.url2 || f.thumbs?.url1 || '',
      isVideo: isVideoFile(f.server_filename || ''),
      dlink: downloadLinks[String(f.fs_id)] || f.dlink || '',
      fsId: String(f.fs_id),
    }));

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          title: files[0]?.name || 'TeraBox Video',
          files,
          surl,
          shareid,
          uk,
          sign,
          timestamp,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
