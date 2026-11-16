'use client';

import { useEffect, useRef, useState } from 'react';
import { SCENE_NAMES, SCENE_NAMES_EN, TechnologyScene } from './home/TechnologyScenes';

export function HomeCarousel({ locale }: { locale: 'en' | 'vi' }) {
  const vi = locale === 'vi';
  const names = vi ? SCENE_NAMES : SCENE_NAMES_EN;
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [inView, setInView] = useState(true);
  const screen = useRef<HTMLElement>(null);
  const paused = !visible || !inView;

  useEffect(() => {
    const hero = screen.current;
    const header = hero?.previousElementSibling;
    if (!hero || header?.tagName !== 'HEADER') return;
    const syncHeight = () => {
      hero.style.setProperty('--home-header-height', `${header.getBoundingClientRect().height}px`);
    };
    syncHeight();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncHeight);
    observer?.observe(header);
    window.addEventListener('resize', syncHeight);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', syncHeight);
    };
  }, []);

  useEffect(() => {
    const syncVisibility = () => setVisible(!document.hidden);
    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    if (screen.current) observer?.observe(screen.current);
    return () => {
      document.removeEventListener('visibilitychange', syncVisibility);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(
      () => setIndex((value) => (value + 1) % SCENE_NAMES.length),
      10000,
    );
    return () => window.clearTimeout(timer);
  }, [index, paused]);

  return (
    <section
      ref={screen}
      className="home-carousel learning-motion"
      aria-label={
        vi
          ? 'Không gian công nghệ chuyển động cùng CodeMark'
          : 'Animated technology universe with CodeMark'
      }
      aria-roledescription={vi ? 'băng chuyền' : 'carousel'}
      data-paused={paused}
      aria-live="off"
    >
      <div className="home-carousel-screen">
        {names.map((name, sceneIndex) => (
          <div
            key={sceneIndex}
            role="group"
            aria-roledescription={vi ? 'cảnh' : 'slide'}
            aria-label={`${vi ? 'Cảnh' : 'Scene'} ${sceneIndex + 1} / ${names.length}: ${name}`}
            aria-hidden={sceneIndex !== index}
            data-paused={paused || sceneIndex !== index}
            className={`learning-motion-slide home-carousel-slide${sceneIndex === index ? ' is-active' : ''}`}
          >
            <TechnologyScene variant={sceneIndex} locale={locale} />
          </div>
        ))}
      </div>
    </section>
  );
}
