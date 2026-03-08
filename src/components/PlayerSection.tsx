import { useState } from "react";
import { Play, Download, Link, Loader2, AlertCircle, FileVideo, ExternalLink } from "lucide-react";
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
}

const PlayerSection = () => {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [videoData, setVideoData] = useState<VideoData | null>(null);
  const [error, setError] = useState("");
  const [activeVideo, setActiveVideo] = useState<TeraBoxFile | null>(null);

  const handleFetch = async () => {
    if (!url.trim()) return;

    if (!url.includes("terabox") && !url.includes("1024tera") && !url.includes("freeterabox") && !url.includes("teraboxlink")) {
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
              {/* Video Player */}
              <div className="relative aspect-video bg-muted/30">
                {activeVideo.dlink ? (
                  <video
                    key={activeVideo.fsId}
                    controls
                    autoPlay
                    className="h-full w-full"
                    poster={activeVideo.thumbnail}
                  >
                    <source src={activeVideo.dlink} type="video/mp4" />
                    Your browser does not support video playback.
                  </video>
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-center">
                      <FileVideo className="mx-auto h-16 w-16 text-muted-foreground/50" />
                      <p className="mt-4 text-sm text-muted-foreground">
                        Direct playback not available. Use download instead.
                      </p>
                    </div>
                  </div>
                )}
              </div>

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

            {/* Multiple files list */}
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
                    <FileVideo className="h-5 w-5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{file.size}</p>
                    </div>
                    {file.dlink && (
                      <Download
                        className="h-4 w-4 shrink-0 text-muted-foreground hover:text-primary"
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
