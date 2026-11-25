import type { Metadata } from 'next';
import Link from 'next/link';
import { AnimatedStat, ProfileFlip } from '@/components/AboutInteractions';
import ScrollReveal from '@/components/ScrollReveal';
import SiteNavigation from '@/components/SiteNavigation';
import StudioAvatar from '@/components/StudioAvatar';
import { getPublishedPortfolio } from '@/lib/portfolio/repository';
import { getPublicGuestbook, getStudioContent } from '@/lib/studio-repository';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'About the Studio | RADYFRAMES',
  description: 'Meet RADYFRAMES Creative Media, an independent post-production studio in Coimbatore.',
};

export default async function AboutPage() {
  const [studioContentResult, portfolio] = await Promise.all([getStudioContent(), getPublishedPortfolio()]);
  const content = studioContentResult.content;
  const projects = portfolio.state === 'ready' ? portfolio.projects : [];
  const guestbook = content.guestbookEnabled
    ? await getPublicGuestbook()
    : { entries: [], unavailable: false };
  const enabledLanguages = Object.values(content.avatar).some((item) => item.enabled);

  return (
    <div className="site">
      <SiteNavigation />
      <ScrollReveal />
      <main id="top" className="aboutPage">
        {studioContentResult.unavailable && (
          <aside className="publicContentWarning" role="status">
            Approved studio content could not be loaded. Built-in site copy is shown until the content connection is restored.
          </aside>
        )}
        <section className="aboutHero">
          <p className="eyebrow">RADYFRAMES / THE STUDIO</p>
          <h1>Story first.<br /><span>Frame by frame.</span></h1>
          <p>An independent post-production studio based in Gandhipuram, Coimbatore.</p>
        </section>

        <section className="section aboutProfile" aria-labelledby="about-title">
          <div className="aboutProfileCopy" data-reveal="up">
            <p className="eyebrow">01 / ABOUT</p>
            <h2 id="about-title">{content.about.role || 'Director / Creative Director'}</h2>
            <p>{content.about.introduction || 'Studio introduction needs owner input.'}</p>
            <div className="aboutStats" aria-label="Studio statistics">
              <AnimatedStat value={projects.length} label="Published projects" />
              <AnimatedStat value={content.services.filter((item) => item.trim()).length} label="Listed services" />
              <AnimatedStat value={content.feedback.filter((item) => item.quote.trim()).length} label="Published feedback" />
            </div>
          </div>
          <div data-reveal="image">
            <ProfileFlip imageUrl={content.about.profileImageUrl} role={content.about.role} introduction={content.about.introduction} />
          </div>
        </section>

        <StudioAvatar content={content.avatar} imageUrl={content.about.profileImageUrl} />
        {!enabledLanguages && <p className="sectionAside">The studio has not enabled a public avatar language yet.</p>}

        <section className="section aboutDetails" aria-labelledby="skills-title">
          <div className="sectionHead">
            <div><p className="eyebrow">02 / CRAFT</p><h2 id="skills-title">Skills &amp; services.</h2></div>
            <p className="sectionAside">Published details only. Every discipline is listed individually.</p>
          </div>
          <div className="aboutSkillLayout">
            <div>
              <h3>Skills</h3>
              {content.skills.length ? (
                <ul className="aboutTagList">{content.skills.filter((item) => item.trim()).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
              ) : <p className="aboutEmpty">Skill details are Missing / Needs Owner Input.</p>}
            </div>
            <div>
              <h3>Services</h3>
              {content.services.length ? (
                <ul className="aboutServiceList">{content.services.filter((item) => item.trim()).map((item, index) => <li key={`${item}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span>{item}</li>)}</ul>
              ) : <p className="aboutEmpty">Service details are Missing / Needs Owner Input.</p>}
            </div>
          </div>
        </section>

        <section className="section aboutProcess" aria-labelledby="process-title">
          <div className="sectionHead">
            <div><p className="eyebrow">03 / APPROACH</p><h2 id="process-title">The making process.</h2></div>
            <p className="sectionAside">A clear, collaborative path from brief to final frame.</p>
          </div>
          {content.process.length ? (
            <div className="processGrid">{content.process.filter((item) => item.title.trim()).map((item, index) => (
              <article className="processCard" key={`${item.title}-${index}`} data-reveal="up">
                <span>{String(index + 1).padStart(2, '0')}</span><h3>{item.title}</h3><p>{item.description}</p>
              </article>
            ))}</div>
          ) : <p className="aboutEmpty">Process details are Missing / Needs Owner Input.</p>}
        </section>

        <section className="section aboutFeedback" aria-labelledby="feedback-title">
          <div className="sectionHead">
            <div><p className="eyebrow">04 / CLIENT NOTES</p><h2 id="feedback-title">Good work, good people.</h2></div>
            <p className="sectionAside">Feedback is shown only when supplied and approved by the studio.</p>
          </div>
          {content.feedback.length ? (
            <div className="feedbackGrid">{content.feedback.filter((item) => item.quote.trim()).map((item, index) => (
              <blockquote className="feedbackCard" key={`${item.client}-${index}`}>
                <span aria-hidden="true">“</span><p>{item.quote}</p><footer>{item.client || 'Client'}{item.project ? ` · ${item.project}` : ''}</footer>
              </blockquote>
            ))}</div>
          ) : <p className="aboutEmpty">No client feedback has been published yet.</p>}
        </section>

        <section className="section aboutConnect" aria-labelledby="connect-title">
          <div className="sectionHead">
            <div><p className="eyebrow">05 / CONNECT</p><h2 id="connect-title">Find the studio.</h2></div>
            <p className="sectionAside">Coimbatore, India.</p>
          </div>
          {content.socialLinks.length ? (
            <ul className="aboutSocialLinks">{content.socialLinks.filter((item) => item.label && item.url).map((item, index) => (
              <li key={`${item.url}-${index}`}><a href={item.url} target="_blank" rel="noopener noreferrer">{item.label}<span aria-hidden="true">↗</span></a></li>
            ))}</ul>
          ) : <p className="aboutEmpty">Social media links are Missing / Needs Owner Input.</p>}
        </section>

        {content.guestbookEnabled && (
          <section className="section guestbookSection" aria-labelledby="guestbook-title">
            <div className="sectionHead">
              <div><p className="eyebrow">06 / GUESTBOOK</p><h2 id="guestbook-title">Studio guestbook.</h2></div>
              <p className="sectionAside">Messages appear here only after studio approval.</p>
            </div>
            {guestbook.unavailable && <p className="reviewDatabaseNotice" role="status">Guestbook storage is unavailable. Approved messages cannot be displayed until the reviewed Stage 1 migration is configured.</p>}
            <div className="guestbookLayout">
              <p className="reviewDatabaseNotice" role="status">Public guestbook submissions are disabled until a server-side anti-spam provider and secure submission workflow are configured. Approved messages remain visible below.</p>
              <div className="guestbookEntries" aria-label="Approved guestbook messages">
                {guestbook.entries.length ? guestbook.entries.map((entry) => (
                  <blockquote key={entry.id}><p>{entry.message}</p><footer>{entry.public_name}</footer></blockquote>
                )) : <p className="aboutEmpty">{guestbook.unavailable ? 'Approved guestbook messages are unavailable until setup is complete.' : 'No guestbook messages have been approved yet.'}</p>}
              </div>
            </div>
          </section>
        )}
      </main>
      <footer className="siteFooter">
        <Link className="brand" href="/"><span>RADY</span><span>FRAMES</span></Link>
        <p>Gandhipuram, Coimbatore</p>
        <p>© {new Date().getFullYear()} RADYFRAMES CREATIVE MEDIA</p>
        <a className="footerLogin" href="/admin/login">Studio Login <span aria-hidden="true">↗</span></a>
      </footer>
    </div>
  );
}
