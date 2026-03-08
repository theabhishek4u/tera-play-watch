import { Play, Zap } from "lucide-react";

const HeroSection = () => {
  return (
    <section id="home" className="relative min-h-screen overflow-hidden pt-20">
      {/* Background effects */}
      <div className="absolute inset-0 bg-grid opacity-30" />
      <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[120px]" />
      <div className="absolute right-1/4 top-2/3 h-[300px] w-[300px] rounded-full bg-accent/5 blur-[100px]" />

      <div className="container relative mx-auto flex min-h-[calc(100vh-5rem)] flex-col items-center justify-center px-6 text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm text-primary">
          <Zap className="h-3.5 w-3.5" />
          Free & Fast TeraBox Video Player
        </div>

        <h1 className="font-display text-5xl font-bold leading-tight tracking-tight md:text-7xl lg:text-8xl">
          Play TeraBox Videos
          <br />
          <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Instantly
          </span>
        </h1>

        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Paste any TeraBox link and stream or download videos directly.
          No sign-up required. Lightning fast.
        </p>

        <a
          href="#player"
          className="group mt-10 inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-4 font-display font-semibold text-primary-foreground transition-all hover:glow-primary hover:scale-105"
        >
          <Play className="h-5 w-5 transition-transform group-hover:scale-110" />
          Start Playing
        </a>

        {/* Stats */}
        <div className="mt-20 grid grid-cols-3 gap-8 md:gap-16">
          {[
            { value: "10M+", label: "Videos Played" },
            { value: "Free", label: "No Hidden Fees" },
            { value: "4K", label: "Max Quality" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="font-display text-2xl font-bold text-primary md:text-3xl">
                {stat.value}
              </div>
              <div className="mt-1 text-xs text-muted-foreground md:text-sm">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
