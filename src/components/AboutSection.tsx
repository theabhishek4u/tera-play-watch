const AboutSection = () => (
  <section id="about" className="relative py-24">
    <div className="absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
    <div className="container mx-auto max-w-3xl px-6 text-center">
      <h2 className="font-display text-3xl font-bold md:text-4xl">
        About <span className="text-primary">Tera Player</span>
      </h2>
      <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
        Tera Player is a free online tool that lets you play and download TeraBox videos
        without any restrictions. Simply paste your TeraBox link, and we'll handle the rest —
        no sign-ups, no ads, just pure streaming.
      </p>
      <p className="mt-4 text-muted-foreground">
        Built for speed, designed for simplicity, and optimized for all devices.
      </p>
    </div>
  </section>
);

export default AboutSection;
