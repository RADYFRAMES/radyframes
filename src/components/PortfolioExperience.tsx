'use client';

import { useState } from 'react';
import PortfolioGallery from '@/components/PortfolioGallery';
import type { PublishedPortfolioResult } from '@/lib/portfolio/repository';
import { PORTFOLIO_SERVICES, projectMatchesService, type PortfolioService } from '@/lib/portfolio/services';

const serviceDetails: Record<PortfolioService, { description: string; mark: string }> = {
  'Video Editing': { description: 'Story, rhythm and a precise final cut.', mark: 'CUT' },
  'Motion Graphics': { description: 'Graphic language brought into motion.', mark: 'MOTION' },
  'CGI / 3D': { description: 'Dimensional imagery with a considered finish.', mark: '03D' },
  VFX: { description: 'Seamless visual effects, shaped for the story.', mark: 'FX' },
  'Color Grading': { description: 'Tone and texture, balanced frame by frame.', mark: 'LUT' },
  Cinematography: { description: 'Intentional images, built around the idea.', mark: 'CAM' },
  'Short Films': { description: 'Compact stories with room to resonate.', mark: 'SHORT' },
  'Feature Films': { description: 'Long-form storytelling, crafted to hold attention.', mark: 'FEATURE' },
  Showreels: { description: 'A focused edit of the work that defines you.', mark: 'REEL' },
};

function serviceProjectCount(portfolio: PublishedPortfolioResult, service: PortfolioService) {
  return 'projects' in portfolio
    ? portfolio.projects.filter((project) => projectMatchesService(project, service)).length
    : 0;
}

export default function PortfolioExperience({ portfolio }: { portfolio: PublishedPortfolioResult }) {
  const [activeService, setActiveService] = useState<PortfolioService | null>(null);
  const projects = 'projects' in portfolio ? portfolio.projects : [];
  const categories = 'categories' in portfolio ? portfolio.categories : [];

  function chooseService(service: PortfolioService) {
    setActiveService(service);
    window.setTimeout(() => {
      const work = document.getElementById('work');
      if (!work) return;
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      work.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    }, 0);
  }

  return (
    <>
      <section className="section" id="work" aria-labelledby="work-title">
        <div className="sectionHead" data-reveal="up">
          <div><p className="eyebrow">01 / SELECTED WORK</p><h2 id="work-title">The edit suite.</h2></div>
          <p className="sectionAside">Real projects. Every frame with intent.</p>
        </div>
        {portfolio.state === 'local-preview' && (
          <aside className="localPreviewNotice" role="note">
            <span className="previewSignal" aria-hidden="true" />
            <div>
              <strong>LOCAL PREVIEW / NOT PUBLISHED</strong>
              <p>
                {portfolio.previewReason === 'tables-unavailable' ? 'Supabase portfolio tables are unavailable. ' : ''}
                Showing {portfolio.projects.length} real inventory videos in development. All remain Pending Review; unavailable links are excluded. This preview is never served in production.
              </p>
            </div>
          </aside>
        )}
        {portfolio.state === 'ready' || portfolio.state === 'local-preview' || activeService ? (
          <PortfolioGallery
            projects={projects}
            categories={categories}
            serviceFilter={activeService}
            onClearService={() => setActiveService(null)}
          />
        ) : portfolio.state === 'empty' ? (
          <div className="emptyState setupState">
            <p>No published videos are available yet.</p>
            <span>Only Supabase projects marked Published appear here. Review and publish approved records in the admin panel{portfolio.excludedUnavailableCount ? `; ${portfolio.excludedUnavailableCount} known unavailable video${portfolio.excludedUnavailableCount === 1 ? ' is' : 's are'} excluded` : ''}.</span>
            <a className="watchLink" href="/admin/login">Studio login ↗</a>
          </div>
        ) : (
          <div className="emptyState">
            <p>{portfolio.state === 'not-configured' ? 'The portfolio database is not connected yet.' : 'The published portfolio could not be loaded.'}</p>
            <span>{portfolio.state === 'not-configured' ? 'Configure Supabase and publish approved projects to show the live portfolio.' : 'Please try again later or check the Supabase project configuration.'}</span>
          </div>
        )}
      </section>

      <section className="section servicesSection" id="services" aria-labelledby="services-title">
        <div className="sectionHead" data-reveal="up">
          <div><p className="eyebrow">03 / WHAT WE DO</p><h2 id="services-title">Made in the edit.</h2></div>
          <p className="sectionAside">Choose a discipline to explore related work.</p>
        </div>
        <div className="serviceGrid">
          {PORTFOLIO_SERVICES.map((service, index) => {
            const details = serviceDetails[service];
            const selected = activeService === service;
            const count = serviceProjectCount(portfolio, service);
            return (
              <article className={`serviceCard${selected ? ' isSelected' : ''}`} key={service} data-reveal="up">
                <button
                  type="button"
                  className="serviceCardSelect"
                  aria-pressed={selected}
                  aria-label={`Show ${count} ${service} videos`}
                  onClick={() => chooseService(service)}
                >
                  <span className="serviceCardNumber">{String(index + 1).padStart(2, '0')} / 09</span>
                  <span className="serviceMark" aria-hidden="true">{details.mark}</span>
                  <span className="serviceCardCopy">
                    <strong>{service}</strong>
                    <small>{details.description}</small>
                  </span>
                  <span className="serviceCardAction">{count ? `${count} PROJECT${count === 1 ? '' : 'S'} ↗` : 'EXPLORE DISCIPLINE ↗'}</span>
                </button>
                <a className="serviceEnquiry" href={`mailto:radnuscreativemedia@gmail.com?subject=${encodeURIComponent(`Enquiry: ${service}`)}`}>Enquire ↗</a>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
