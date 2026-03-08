import { useState } from "react";
import { Play, Download, Link, Loader2, AlertCircle } from "lucide-react";

const PlayerSection = () => {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [videoData, setVideoData] = useState<{
    title: string;
    thumbnail: string;
    size: string;
    videoUrl: string;
  } | null>(null);
  const [error, setError] = useState("");

  const handleFetch = async () => {
    if (!url.trim()) return;
    
    if (!url.includes("terabox") && !url.includes("teraboxapp") && !url.includes("1024tera")) {
      setError("कृपया एक valid TeraBox URL डालें।");
      return;
    }

    setLoading(true);
    setError("");
    setVideoData(null);

    // Simulate fetching — real implementation would need a backend proxy
    setTimeout(() => {
      setLoading(false);
      setVideoData({
        title: "TeraBox Video — " + url.split("/").pop()?.slice(0, 20),
        thumbnail: "",
        size: "124 MB",
        videoUrl: url,
      });
    }, 2000);
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
            <div className="mt-4 flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
        </div>

        {/* Video Player Area */}
        {videoData && (
          <div className="mx-auto mt-10 max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              {/* Player */}
              <div className="relative aspect-video bg-muted/50 flex items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 transition-all hover:scale-110 hover:bg-primary/20 cursor-pointer">
                    <Play className="h-8 w-8 fill-primary text-primary" />
                  </div>
                  <p className="mt-4 text-sm text-muted-foreground">
                    Video player requires backend API integration
                  </p>
                </div>
              </div>

              {/* Info Bar */}
              <div className="flex flex-col gap-4 border-t border-border p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-display font-semibold text-foreground">
                    {videoData.title}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Size: {videoData.size}
                  </p>
                </div>
                <button className="flex items-center gap-2 rounded-xl bg-primary/10 px-5 py-2.5 text-sm font-semibold text-primary transition-all hover:bg-primary/20">
                  <Download className="h-4 w-4" />
                  Download
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default PlayerSection;
