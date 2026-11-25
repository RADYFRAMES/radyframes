import PortfolioExperience from '@/components/PortfolioExperience';
import PortfolioGallery from '@/components/PortfolioGallery';
import PortfolioShowcase from '@/components/PortfolioShowcase';
import ScrollReveal from '@/components/ScrollReveal';
import SiteNavigation from '@/components/SiteNavigation';
import StudioAvatar from '@/components/StudioAvatar';
import CinematicHero from '@/components/CinematicHero';
import { getPortfolioHeroVideoSettings, getPortfolioShowcaseSettings, getPublishedPortfolio } from '@/lib/portfolio/repository';
import { filterPublishedShowcaseProjects } from '@/lib/portfolio/showcase';
import { resolveHeroVideoSource } from '@/lib/portfolio/hero';
import { getStudioContent } from '@/lib/studio-repository';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [portfolio, showcaseSettings, heroVideoSettings, studioContentResult] = await Promise.all([
    getPublishedPortfolio(),
    getPortfolioShowcaseSettings(),
    getPortfolioHeroVideoSettings(),
    getStudioContent(),
  ]);
  const content = studioContentResult.content;
  const showcaseProjects = portfolio.state === 'ready'
    ? filterPublishedShowcaseProjects(showcaseSettings, portfolio.projects)
    : [];
  const effectiveShowcaseSettings = showcaseProjects.length === 4 ? showcaseSettings : null;
  const heroSource = resolveHeroVideoSource(
    heroVideoSettings,
    process.env.NEXT_PUBLIC_HERO_VIDEO_URL,
  );
  const heroVideoUrl = heroSource.videoUrl;
  const heroPosterUrl = heroSource.posterUrl;
  const showreel = portfolio.state === 'ready'
    ? portfolio.projects.find((project) => project.category?.toLowerCase() === 'showreels')
    : undefined;
  return (
    <div className="site">
      <SiteNavigation />
      <ScrollReveal />

      <main id="top">
        {studioContentResult.unavailable && (
          <aside className="publicContentWarning" role="status">
            Approved studio content could not be loaded. Built-in site copy is shown until the content connection is restored.
          </aside>
        )}
        <CinematicHero key={`${heroVideoUrl ?? ''}:${heroPosterUrl ?? ''}`} videoUrl={heroVideoUrl} posterUrl={heroPosterUrl} />

        <PortfolioShowcase projects={showcaseProjects} settings={effectiveShowcaseSettings} />

        <PortfolioExperience portfolio={portfolio} />

        <section className="showreelSection" id="showreel" aria-labelledby="showreel-title">
          <div className="showreelEditorial" data-reveal="up">
            <p className="eyebrow">02 / THE STUDIO REEL</p>
            <h2 id="showreel-title">Cut to<br /><span>what matters.</span></h2>
            <p>A moving-image studio for work with a point of view. Editing, filmmaking and finishing — one considered frame at a time.</p>
            <a className="textLink" href="#work">Explore selected work <span aria-hidden="true">↘</span></a>
          </div>
          <div className={`showreelStage${showreel ? ' hasShowreel' : ''}`} data-reveal="image">
            {showreel ? (
              <PortfolioGallery projects={[showreel]} categories={[]} hideFilters />
            ) : (
              <div className="showreelSlate">
                <div className="filmCorner filmCornerTop" />
                <div className="showreelPulse" aria-hidden="true"><span>RF</span><i /></div>
                <p>NO DEDICATED REEL PUBLISHED</p>
                <small>A real, approved showreel will appear here when designated.</small>
                <div className="filmCorner filmCornerBottom" />
              </div>
            )}
          </div>
        </section>

        <section className="section split" id="about" aria-labelledby="about-title">
          <div data-reveal="up">
            <p className="eyebrow">04 / ABOUT THE STUDIO</p>
            <h2 id="about-title">{content.about.role || 'A sharp eye. A steady hand.'}</h2>
          </div>
          <div className="homeAboutCopy" data-reveal="up">
            <p>{content.about.introduction}</p>
            <a className="textLink" href="/about">Meet the studio <span aria-hidden="true">↗</span></a>
          </div>
        </section>

        <StudioAvatar content={content.avatar} imageUrl={content.about.profileImageUrl} />

        <section className="section contact" id="contact" aria-labelledby="contact-title">
          <p className="eyebrow" data-reveal="up">05 / START A CONVERSATION</p>
          <h2 id="contact-title" data-reveal="up">Let&apos;s make<br /><span>something move.</span></h2>
          <p className="contactCopy" data-reveal="up">Have a story that needs the right cut? We&apos;d like to hear about it.</p>
          <div className="contactActions" data-reveal="up">
            <a className="button" href="mailto:radnuscreativemedia@gmail.com?subject=Project%20enquiry">Email us</a>
            <a className="button ghost" href="https://maps.google.com/?q=Gandhipuram%2C%20Coimbatore" target="_blank" rel="noreferrer">Directions</a>
          </div>
        </section>
      </main>

      <footer>
        <a className="brand" href="#top"><span>RADY</span><span>FRAMES</span></a>
        <p>Gandhipuram, Coimbatore</p>
        <p>© {new Date().getFullYear()} RADYFRAMES CREATIVE MEDIA</p>
        <a className="footerLogin" href="/admin/login">Studio Login <span aria-hidden="true">↗</span></a>
      </footer>
    </div>
  );
}
