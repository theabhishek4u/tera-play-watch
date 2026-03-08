const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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

    // Extract the share code from the URL
    let shareUrl = url.trim();
    
    // Handle shortened URLs by following redirects
    if (shareUrl.includes('1024tera') || shareUrl.includes('freeterabox') || shareUrl.includes('teraboxlink')) {
      try {
        const redirectRes = await fetch(shareUrl, { redirect: 'follow' });
        shareUrl = redirectRes.url;
        await redirectRes.text(); // consume body
      } catch (e) {
        console.log('Redirect follow failed, using original URL');
      }
    }

    // Extract surl parameter or short URL code
    let shortUrl = '';
    try {
      const urlObj = new URL(shareUrl);
      shortUrl = urlObj.searchParams.get('surl') || '';
      if (!shortUrl) {
        // Try extracting from path like /s/1XXX
        const pathMatch = urlObj.pathname.match(/\/s\/(.+)/);
        if (pathMatch) {
          shortUrl = pathMatch[1];
        }
      }
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid URL format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!shortUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'Could not extract share code from URL. Please check the URL.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Extracted short URL code:', shortUrl);

    // Use TeraBox API to get file info
    const apiUrl = `https://www.terabox.app/api/shorturlinfo?app_id=250528&shorturl=${encodeURIComponent(shortUrl)}&root=1`;
    
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://www.terabox.app/',
    };

    console.log('Fetching from TeraBox API:', apiUrl);
    const apiRes = await fetch(apiUrl, { headers });
    const apiData = await apiRes.json();
    
    console.log('TeraBox API response status:', apiRes.status, 'errno:', apiData.errno);

    if (apiData.errno !== 0) {
      // Try alternative domain
      const altApiUrl = `https://www.1024tera.com/api/shorturlinfo?app_id=250528&shorturl=${encodeURIComponent(shortUrl)}&root=1`;
      console.log('Trying alternative API:', altApiUrl);
      const altRes = await fetch(altApiUrl, { headers });
      const altData = await altRes.json();
      
      if (altData.errno !== 0) {
        return new Response(
          JSON.stringify({ success: false, error: `TeraBox API error (${altData.errno}). The link may be expired or invalid.` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Use alt data
      return processTeraBoxData(altData, shortUrl, 'https://www.1024tera.com', headers);
    }

    return processTeraBoxData(apiData, shortUrl, 'https://www.terabox.app', headers);

  } catch (error) {
    console.error('Error processing TeraBox URL:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function processTeraBoxData(apiData: any, shortUrl: string, baseUrl: string, headers: Record<string, string>) {
  const fileList = apiData.list || [];
  
  if (fileList.length === 0) {
    return new Response(
      JSON.stringify({ success: false, error: 'No files found in the shared link' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const shareid = apiData.shareid;
  const uk = apiData.uk;
  const sign = apiData.sign;
  const timestamp = apiData.timestamp;

  // Get download links
  const fsIds = fileList.map((f: any) => f.fs_id);
  const dlApiUrl = `${baseUrl}/api/sharedownload?app_id=250528&shareid=${shareid}&uk=${uk}&sign=${sign}&timestamp=${timestamp}&fid_list=[${fsIds.join(',')}]`;
  
  console.log('Fetching download links...');
  const dlRes = await fetch(dlApiUrl, { headers });
  const dlData = await dlRes.json();
  
  console.log('Download API response errno:', dlData.errno);

  const files = fileList.map((file: any, index: number) => {
    const dlInfo = dlData.list?.[index];
    return {
      name: file.server_filename || 'Unknown',
      size: formatSize(file.size || 0),
      sizeBytes: file.size || 0,
      thumbnail: file.thumbs?.url3 || file.thumbs?.url2 || file.thumbs?.url1 || '',
      isVideo: isVideoFile(file.server_filename || ''),
      dlink: dlInfo?.dlink || file.dlink || '',
      fsId: file.fs_id,
    };
  });

  // Filter to video files or return all if no videos
  const videoFiles = files.filter((f: any) => f.isVideo);
  const resultFiles = videoFiles.length > 0 ? videoFiles : files;

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        title: apiData.title || resultFiles[0]?.name || 'TeraBox Video',
        files: resultFiles,
        shareid,
        uk,
        sign,
        timestamp,
      }
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

function isVideoFile(filename: string): boolean {
  const videoExts = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp', '.ts'];
  const lower = filename.toLowerCase();
  return videoExts.some(ext => lower.endsWith(ext));
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
