import { Play, Menu, X } from "lucide-react";
import { useState } from "react";

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex items-center justify-between px-6 py-4">
        <a href="#" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 glow-primary">
            <Play className="h-4 w-4 fill-primary text-primary" />
          </div>
          <span className="font-display text-xl font-bold tracking-tight text-foreground">
            Tera<span className="text-primary">Player</span>
          </span>
        </a>

        <div className="hidden items-center gap-8 md:flex">
          {["Home", "Player", "Features", "About"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              {item}
            </a>
          ))}
        </div>

        <button
          className="text-muted-foreground md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-border/50 bg-background/95 backdrop-blur-xl md:hidden">
          {["Home", "Player", "Features", "About"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              className="block px-6 py-3 text-sm text-muted-foreground transition-colors hover:text-primary"
              onClick={() => setMobileOpen(false)}
            >
              {item}
            </a>
          ))}
        </div>
      )}
    </nav>
  );
};

export default Navbar;
