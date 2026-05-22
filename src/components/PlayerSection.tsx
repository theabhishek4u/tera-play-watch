import { useState, useRef } from "react";
import { Play, Download, Link, Loader2, AlertCircle, FileVideo, Pause, Volume2, VolumeX, Maximize } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface TeraBoxFile {
  name: string;
  size: string;
  sizeBytes: number;
  thumbnail: string;
  isVideo: boolean;
  dlink: string;
  fsId: string;
}

interface VideoData {
  title: string;
  files: TeraBoxFile[];
  surl?: string;
}

const PlayerSection = () => {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [videoData, setVideoData] = useState<VideoData | null>(null);
  const [error, setError] = useState("");
  const [activeVideo, setActiveVideo] = useState<TeraBoxFile | null>(null);
  const [playing, setPlaying] = useState(false);
  const [videoError, setVideoError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleFetch = async () => {
    if (!url.trim()) return;

    const validDomains = ["terabox", "1024tera", "freeterabox", "teraboxlink", "teraboxshare"];
    if (!validDomains.some(d => url.includes(d))) {
      setError("Please enter a valid TeraBox URL.");
      return;
    }

    setLoading(true);
    setError("");
    setVideoData(null);
    setActiveVideo(null);
    setPlaying(false);
    setVideoError("");

    try {
      const { data, error: fnError } = await supabase.functions.invoke("terabox-fetch", {
        body: { url: url.trim() },
      });

      if (fnError) {
        setError("TeraBox link fetch failed. Please refresh the TeraBox session cookie in backend secrets and try again.");
        return;
      }

      if (!data?.success) {
        setError(data?.error || "Could not fetch video from TeraBox. Please try another public TeraBox link.");
        return;
      }

      setVideoData(data.data);
      if (data.data.files?.length > 0) {
        setActiveVideo(data.data.files[0]);
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const getProxyUrl = (file: TeraBoxFile) => {
    if (!file.dlink) return "";
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    return `https://${projectId}.supabase.co/functions/v1/terabox-proxy?dlink=${encodeURIComponent(file.dlink)}`;
  };

  const handlePlay = () => {
    if (!activeVideo) return;
    setVideoError("");
    setPlaying(true);
  };

  const handleDownload = (file: TeraBoxFile) => {
    const proxyUrl = getProxyUrl(file);
    if (proxyUrl) {
      const a = document.createElement("a");
      a.href = proxyUrl;
      a.download = file.name;
      a.target = "_blank";
      a.click();
    }
  };

  const toggleFullscreen = () => {
    if (videoRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoRef.current.requestFullscreen();
      }
    }
  };

  return (
    <section id="player" className="relative py-24">
      <div className="absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      <div className="container mx-auto px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-3xl font-bold md:text-4xl">
            Paste Your <span className="text-primary">TeraBox Link</span>
          </h2>
          <p className="mt-3 text-muted-foreground">
            Enter the TeraBox video URL below and hit Enter to fetch video info.
          </p>
        </div>

        {/* URL Input */}
        <div className="mx-auto mt-10 max-w-2xl">
          <div className="relative flex items-center rounded-2xl border border-border bg-card p-2 transition-all focus-within:border-primary/50">
            <Link className="ml-4 h-5 w-5 shrink-0 text-muted-foreground" />
            <input
              type="url"
              placeholder="https://terabox.com/s/your-video-link"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleFetch()}
              className="flex-1 bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <button
              onClick={handleFetch}
              disabled={loading || !url.trim()}
              className="flex shrink-0 items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {loading ? "Fetching..." : "Fetch"}
            </button>
          </div>

          {error && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Video Result */}
        {videoData && activeVideo && (
          <div className="mx-auto mt-10 max-w-4xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              {/* Video Player / Thumbnail */}
              <div className="relative aspect-video bg-black">
                {playing ? (
                  <>
                    <video
                      ref={videoRef}
                      src={getProxyUrl(activeVideo)}
                      className="h-full w-full"
                      controls
                      autoPlay
                      onError={() => setVideoError("Video playback failed. Try downloading instead.")}
                    />
                    {videoError && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                        <div className="text-center px-6">
                          <AlertCircle className="mx-auto h-10 w-10 text-destructive mb-3" />
                          <p className="text-sm text-muted-foreground">{videoError}</p>
                          <button
                            onClick={() => handleDownload(activeVideo)}
                            className="mt-4 flex mx-auto items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
                          >
                            <Download className="h-4 w-4" />
                            Download Instead
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="relative h-full w-full cursor-pointer" onClick={handlePlay}>
                    {activeVideo.thumbnail ? (
                      <img src={activeVideo.thumbnail} alt={activeVideo.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted/50">
                        <FileVideo className="h-16 w-16 text-muted-foreground/40" />
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors hover:bg-black/20">
                      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary shadow-lg transition-transform hover:scale-110">
                        <Play className="ml-1 h-8 w-8 fill-primary-foreground text-primary-foreground" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Info Bar */}
              <div className="border-t border-border p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="truncate font-display font-semibold text-foreground">{activeVideo.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Size: {activeVideo.size}</p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleDownload(activeVideo)}
                      className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:scale-105"
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Multiple files */}
            {videoData.files.length > 1 && (
              <div className="mt-4 space-y-2">
                <h4 className="font-display text-sm font-semibold text-muted-foreground">
                  All Files ({videoData.files.length})
                </h4>
                {videoData.files.map((file) => (
                  <button
                    key={file.fsId}
                    onClick={() => { setActiveVideo(file); setPlaying(false); setVideoError(""); }}
                    className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-all ${
                      activeVideo.fsId === file.fsId ? "border-primary/50 bg-primary/5" : "border-border bg-card hover:border-primary/30"
                    }`}
                  >
                    {file.thumbnail ? (
                      <img src={file.thumbnail} alt="" className="h-12 w-16 rounded-lg object-cover" />
                    ) : (
                      <FileVideo className="h-5 w-5 shrink-0 text-primary" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{file.size}</p>
                    </div>
                    <Download
                      className="h-4 w-4 shrink-0 text-muted-foreground hover:text-primary cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); handleDownload(file); }}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default PlayerSection;
