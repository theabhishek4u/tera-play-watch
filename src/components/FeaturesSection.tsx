import { Zap, Shield, Download, Smartphone, Globe, Play } from "lucide-react";

const features = [
  { icon: Zap, title: "Lightning Fast", desc: "Instant video fetching with zero buffering delays." },
  { icon: Shield, title: "Safe & Secure", desc: "No data stored. Your privacy is our priority." },
  { icon: Download, title: "Easy Download", desc: "Download videos in original quality with one click." },
  { icon: Smartphone, title: "Mobile Friendly", desc: "Works perfectly on any device, any screen size." },
  { icon: Globe, title: "No Sign-Up", desc: "Use instantly without creating any account." },
  { icon: Play, title: "Stream Directly", desc: "Play videos online without downloading first." },
];

const FeaturesSection = () => (
  <section id="features" className="relative py-24">
    <div className="absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
    <div className="container mx-auto px-6">
      <div className="text-center">
        <h2 className="font-display text-3xl font-bold md:text-4xl">
          Why <span className="text-primary">Tera Player</span>?
        </h2>
        <p className="mt-3 text-muted-foreground">Everything you need for seamless TeraBox playback.</p>
      </div>

      <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div
            key={f.title}
            className="group rounded-2xl border border-border bg-card p-6 transition-all hover:border-primary/30 hover:glow-primary"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
              <f.icon className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default FeaturesSection;
