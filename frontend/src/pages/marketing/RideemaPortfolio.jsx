import { ArrowUpRight, Code2, Mail, MapPin, Network, Sparkles } from 'lucide-react';

const projects = [
  {
    number: '01',
    title: 'DevDrop',
    type: 'Developer marketplace',
    description: 'A focused home for useful digital products, built for shipping teams.',
    stack: 'React / Node / MongoDB',
  },
  {
    number: '02',
    title: 'Genie',
    type: 'AI workflow engine',
    description: 'A practical bridge between a good idea and a working first version.',
    stack: 'TypeScript / APIs / AI',
  },
];

export default function RideemaPortfolio() {
  return (
    <div className="portfolio-page">
      <header className="portfolio-nav">
        <a className="portfolio-mark" href="#top" aria-label="Rideema home">R/</a>
        <nav aria-label="Portfolio navigation">
          <a href="#work">Work</a>
          <a href="#about">About</a>
          <a href="mailto:hello@rideema.dev" className="portfolio-nav-cta">Let's talk <ArrowUpRight size={15} /></a>
        </nav>
      </header>

      <main id="top">
        <section className="portfolio-hero">
          <div className="portfolio-eyebrow"><span /> Available for select projects</div>
          <h1>I build digital<br /><em>things that work.</em></h1>
          <div className="portfolio-hero-bottom">
            <p className="portfolio-intro">Hi, I&apos;m Rideema — a full stack developer turning sharp ideas into fast, thoughtful products.</p>
            <a className="portfolio-scroll" href="#work">Scroll to explore <ArrowUpRight size={18} /></a>
          </div>
          <div className="portfolio-stamp"><Sparkles size={18} /><span>FULL STACK<br />DEVELOPER</span></div>
        </section>

        <section className="portfolio-section portfolio-work" id="work">
          <div className="portfolio-section-heading">
            <p className="portfolio-kicker">Selected work</p>
            <p className="portfolio-section-note">A few things from the workbench<br />and the spaces between.</p>
          </div>
          <div className="portfolio-projects">
            {projects.map((project) => (
              <article className="portfolio-project" key={project.number}>
                <div className="portfolio-project-top"><span>{project.number}</span><ArrowUpRight size={22} /></div>
                <div>
                  <p className="portfolio-project-type">{project.type}</p>
                  <h2>{project.title}</h2>
                  <p className="portfolio-project-description">{project.description}</p>
                </div>
                <p className="portfolio-project-stack">{project.stack}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="portfolio-section portfolio-about" id="about">
          <div className="portfolio-section-heading"><p className="portfolio-kicker">The short version</p></div>
          <div className="portfolio-about-copy">
            <h2>Curious by default.<br /><span>Serious about craft.</span></h2>
            <p>I work across the whole stack, from a clean interface to the systems underneath it. My favorite projects sit at the intersection of useful, unusual, and just a little bit ambitious.</p>
            <div className="portfolio-location"><MapPin size={17} /> Based wherever the good work is</div>
          </div>
        </section>

        <section className="portfolio-contact">
          <p className="portfolio-kicker">Have something in mind?</p>
          <h2>Let&apos;s make it<br /><em>real.</em></h2>
          <a className="portfolio-email" href="mailto:hello@rideema.dev">hello@rideema.dev <ArrowUpRight size={24} /></a>
        </section>
      </main>

      <footer className="portfolio-footer">
        <span>© {new Date().getFullYear()} Rideema</span>
        <span>Built with intent.</span>
        <div className="portfolio-socials"><a href="https://github.com" aria-label="GitHub"><Code2 size={18} /></a><a href="https://linkedin.com" aria-label="LinkedIn"><Network size={18} /></a><a href="mailto:hello@rideema.dev" aria-label="Email"><Mail size={18} /></a></div>
      </footer>
    </div>
  );
}