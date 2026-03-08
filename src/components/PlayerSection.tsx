import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Download, Link, Loader2, AlertCircle, FileVideo, ExternalLink, Pause, Volume2, VolumeX, Maximize } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import Hls from "hls.js";

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
  streamUrl?: string;
}

const VideoPlayer = ({ streamUrl, thumbnail, name }: { streamUrl: string; thumbnail: string; name: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const initHls = useCallback(() => {
    if (!videoRef.current || !streamUrl) return;

    setLoading(true);
    setError("");

    // Cleanup previous instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        xhrSetup: (xhr) => {
          xhr.withCredentials = false;
        },
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(videoRef.current);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false);
        videoRef.current?.play().then(() => setPlaying(true)).catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        console.error('HLS error:', data.type, data.details);
        if (data.fatal) {
          setLoading(false);
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            setError("Network error. Retrying...");
            setTimeout(() => hls.startLoad(), 2000);
          } else {
            setError("Video playback failed. Try downloading instead.");
          }
        }
      });

      hlsRef.current = hls;
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS
      videoRef.current.src = streamUrl;
      videoRef.current.addEventListener('loadedmetadata', () => {
        setLoading(false);
        videoRef.current?.play().then(() => setPlaying(true)).catch(() => {});
      });
    } else {
      setError("HLS not supported in this browser");
      setLoading(false);
    }
  }, [streamUrl]);

  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, []);

  const handlePlayClick = () => {
    if (!playing && !hlsRef.current) {
      initHls();
    } else if (videoRef.current) {
      if (playing) {
        videoRef.current.pause();
        setPlaying(false);
      } else {
        videoRef.current.play().then(() => setPlaying(true)).catch(() => {});
      }
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !muted;
      setMuted(!muted);
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
    <div className="relative aspect-video bg-muted/30 group">
      <video
        ref={videoRef}
        className="h-full w-full"
        poster={thumbnail}
        playsInline
        onClick={handlePlayClick}
      />

      {/* Play overlay */}
      {!playing && !loading && (
        <div
          className="absolute inset-0 flex cursor-pointer items-center justify-center bg-background/30"
          onClick={handlePlayClick}
        >
          {thumbnail && (
            <img src={thumbnail} alt={name} className="absolute inset-0 h-full w-full object-cover opacity-80" />
          )}
          <div className="relative z-10 flex h-20 w-20 items-center justify-center rounded-full bg-primary/90 shadow-lg transition-transform hover:scale-110">
            <Play className="h-8 w-8 fill-primary-foreground text-primary-foreground ml-1" />
          </div>
        </div>
      )}

      {/* Loading spinner */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute bottom-4 left-4 right-4 rounded-lg bg-destructive/90 px-4 py-2 text-sm text-destructive-foreground">
          {error}
        </div>
      )}

      {/* Controls */}
      {playing && (
        <div className="absolute bottom-0 left-0 right-0 flex items-center gap-3 bg-gradient-to-t from-background/80 to-transparent px-4 py-3 opacity-0 transition-opacity group-hover:opacity-100">
          <button onClick={handlePlayClick} className="text-foreground">
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>
          <button onClick={toggleMute} className="text-foreground">
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
          <div className="flex-1" />
          <button onClick={toggleFullscreen} className="text-foreground">
            <Maximize className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
};

const PlayerSection = () => {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [videoData, setVideoData] = useState<VideoData | null>(null);
  const [error, setError] = useState("");
  const [activeVideo, setActiveVideo] = useState<TeraBoxFile | null>(null);

  const handleFetch = async () => {
    if (!url.trim()) return;

    const validDomains = ["terabox", "1024tera", "freeterabox", "teraboxlink", "teraboxshare"];
    if (!validDomains.some(d => url.includes(d))) {
      setError("कृपया एक valid TeraBox URL डालें।");
      return;
    }

    setLoading(true);
    setError("");
    setVideoData(null);
    setActiveVideo(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("terabox-fetch", {
        body: { url: url.trim() },
      });

      if (fnError) {
        setError(fnError.message || "Failed to fetch video data");
        return;
      }

      if (!data?.success) {
        setError(data?.error || "Could not fetch video from TeraBox");
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

  const handleDownload = (file: TeraBoxFile) => {
    if (file.dlink) {
      window.open(file.dlink, "_blank");
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
            Enter the TeraBox video URL below and hit Enter to play or download.
          </p>
        </div>

        {/* URL Input */}
        <div className="mx-auto mt-10 max-w-2xl">
          <div className="relative flex items-center rounded-2xl border border-border bg-card p-2 transition-all focus-within:border-primary/50 focus-within:glow-primary">
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
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
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

        {/* Video Player Area */}
        {videoData && activeVideo && (
          <div className="mx-auto mt-10 max-w-4xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              {/* Video Player - HLS Streaming */}
              {activeVideo.isVideo && videoData.streamUrl ? (
                <VideoPlayer
                  key={activeVideo.fsId}
                  streamUrl={videoData.streamUrl}
                  thumbnail={activeVideo.thumbnail}
                  name={activeVideo.name}
                />
              ) : activeVideo.thumbnail ? (
                <div className="relative aspect-video">
                  <img src={activeVideo.thumbnail} alt={activeVideo.name} className="h-full w-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-background/40">
                    <a
                      href={activeVideo.dlink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/90 transition-all hover:scale-110"
                    >
                      <Play className="h-8 w-8 fill-primary-foreground text-primary-foreground ml-1" />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="flex aspect-video items-center justify-center bg-muted/30">
                  <FileVideo className="h-16 w-16 text-muted-foreground/50" />
                </div>
              )}

              {/* Info Bar */}
              <div className="border-t border-border p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="truncate font-display font-semibold text-foreground">
                      {activeVideo.name}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Size: {activeVideo.size}
                    </p>
                  </div>
                  <div className="flex gap-3">
                    {activeVideo.dlink && (
                      <button
                        onClick={() => handleDownload(activeVideo)}
                        className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:scale-105"
                      >
                        <Download className="h-4 w-4" />
                        Download
                      </button>
                    )}
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:text-foreground"
                    >
                      <ExternalLink className="h-4 w-4" />
                      TeraBox
                    </a>
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
                    onClick={() => setActiveVideo(file)}
                    className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-all ${
                      activeVideo.fsId === file.fsId
                        ? "border-primary/50 bg-primary/5"
                        : "border-border bg-card hover:border-primary/30"
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
                    {file.dlink && (
                      <Download
                        className="h-4 w-4 shrink-0 text-muted-foreground hover:text-primary cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(file);
                        }}
                      />
                    )}
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
