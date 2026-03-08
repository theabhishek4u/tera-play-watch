import { Play } from "lucide-react";

const Footer = () => (
  <footer className="border-t border-border/50 py-10">
    <div className="container mx-auto flex flex-col items-center gap-4 px-6 text-center">
      <div className="flex items-center gap-2">
        <Play className="h-4 w-4 fill-primary text-primary" />
        <span className="font-display font-bold">Tera<span className="text-primary">Player</span></span>
      </div>
      <p className="text-sm text-muted-foreground">
        © {new Date().getFullYear()} Tera Player. Free TeraBox video player & downloader.
      </p>
    </div>
  </footer>
);

export default Footer;
