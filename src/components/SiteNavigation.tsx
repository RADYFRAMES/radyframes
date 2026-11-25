'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';

const sectionLinks = [
  { id: 'work', label: 'Work', href: '/#work' },
  { id: 'showreel', label: 'Showreel', href: '/#showreel' },
  { id: 'services', label: 'Services', href: '/#services' },
  { id: 'about', label: 'Studio', href: '/about' },
  { id: 'contact', label: 'Contact', href: '/#contact' },
];

export default function SiteNavigation() {
  const pathname = usePathname();
  const headerRef = useRef<HTMLElement>(null);
  const mobileMenuRef = useRef<HTMLDetailsElement>(null);
  const [activeSection, setActiveSection] = useState('');

  useEffect(() => {
    const updateScrollState = () => {
      headerRef.current?.classList.toggle('is-scrolled', window.scrollY > 24);
    };
    updateScrollState();
    window.addEventListener('scroll', updateScrollState, { passive: true });

    const sections = pathname === '/'
      ? sectionLinks
        .filter(({ id }) => id !== 'about')
        .map(({ id }) => document.getElementById(id))
        .filter((section): section is HTMLElement => section !== null)
      : [];
    const observer = new IntersectionObserver((entries) => {
      const current = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (current) setActiveSection(current.target.id);
    }, { rootMargin: '-24% 0px -58% 0px', threshold: [0, 0.15, 0.4, 0.7] });
    sections.forEach((section) => observer.observe(section));

    return () => {
      window.removeEventListener('scroll', updateScrollState);
      observer.disconnect();
    };
  }, [pathname]);

  function closeMobileMenu() {
    mobileMenuRef.current?.removeAttribute('open');
  }

  return (
    <header className="nav" aria-label="Primary navigation" ref={headerRef}>
      <Link className="brand" href="/" aria-label="RADYFRAMES home">
        <span>RADY</span><span>FRAMES</span>
      </Link>
      <nav className="navLinks" aria-label="Sections">
        {sectionLinks.map(({ id, label, href }) => (
          <Link href={pathname === '/' && href.startsWith('/#') ? href.slice(1) : href} key={id} aria-current={activeSection === id || (id === 'about' && pathname === '/about') ? 'location' : undefined}>{label}</Link>
        ))}
      </nav>
      <details className="mobileMenu" ref={mobileMenuRef}>
        <summary>Menu</summary>
        <nav aria-label="Mobile sections">
          {sectionLinks.map(({ id, label, href }) => (
            <Link href={pathname === '/' && href.startsWith('/#') ? href.slice(1) : href} key={id} onClick={closeMobileMenu} aria-current={activeSection === id || (id === 'about' && pathname === '/about') ? 'location' : undefined}>{label}</Link>
          ))}
          <a className="adminLoginLink mobileAdminLogin" href="/admin/login" onClick={closeMobileMenu}>Admin Login <span aria-hidden="true">↗</span></a>
        </nav>
      </details>
      <a className="adminLoginLink desktopAdminLogin" href="/admin/login">Admin Login <span aria-hidden="true">↗</span></a>
      <ThemeToggle />
    </header>
  );
}
