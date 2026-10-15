'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const routeLinks = [
  { href: '/groups', label: 'Nhóm Facebook' },
  { href: '/live', label: 'Đăng Facebook' },
];

export default function RouteNavigation() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== '/') return;

    const nav = document.querySelector('.sidebar nav');
    if (!nav) return;

    nav.querySelectorAll('[data-route-link="autospace"]').forEach((node) => node.remove());

    const divider = document.createElement('div');
    divider.className = 'routeNavDivider';
    divider.dataset.routeLink = 'autospace';
    nav.appendChild(divider);

    routeLinks.forEach((item) => {
      const link = document.createElement('a');
      link.href = item.href;
      link.textContent = item.label;
      link.className = 'routeNavLink';
      link.dataset.routeLink = 'autospace';
      nav.appendChild(link);
    });

    return () => {
      nav.querySelectorAll('[data-route-link="autospace"]').forEach((node) => node.remove());
    };
  }, [pathname]);

  if (pathname !== '/live') return null;

  return (
    <aside className="globalRouteSidebar">
      <a className="globalRouteBrand" href="/">
        <span>A</span>
        <div><strong>AutoSpace</strong><small>Campaign Hub</small></div>
      </a>
      <nav>
        <a href="/">Tổng quan</a>
        <a href="/groups">Nhóm Facebook</a>
        <a className="active" href="/live">Đăng Facebook</a>
      </nav>
      <div className="globalRouteFoot">Facebook Provider · Live</div>
    </aside>
  );
}
