'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';

const banners = [
  { src: '/banners/web-development.png', en: 'Learn web development', vi: 'Học lập trình web' },
  { src: '/banners/collaborative-learning.png', en: 'Build and learn together', vi: 'Cùng học và xây dựng dự án' },
  { src: '/banners/learning-achievements.png', en: 'Celebrate learning achievements', vi: 'Ghi nhận thành tích học tập' },
];

export function HomeCarousel({ locale }: { locale: 'en' | 'vi' }) {
  const vi = locale === 'vi';
  const names = banners.map((banner) => vi ? banner.vi : banner.en);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [visible, setVisible] = useState(true);
  const [inView, setInView] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const screen = useRef<HTMLElement>(null);
  const paused = !playing || !visible || !inView || hovered || focused;

  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const syncPreference = () => {
      const reduced =
        (preference?.matches ?? true) || document.documentElement.dataset.motion === 'false';
      setReducedMotion(reduced);
      setPlaying(!reduced);
    };
    const syncVisibility = () => setVisible(!document.hidden);
    syncPreference();
    syncVisibility();
    preference?.addEventListener('change', syncPreference);
    document.addEventListener('visibilitychange', syncVisibility);
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    if (screen.current) observer?.observe(screen.current);
    const preferencesObserver = new MutationObserver(syncPreference);
    preferencesObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-motion'],
    });
    return () => {
      preference?.removeEventListener('change', syncPreference);
      document.removeEventListener('visibilitychange', syncVisibility);
      observer?.disconnect();
      preferencesObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(
      () => setIndex((value) => (value + 1) % banners.length),
      8000,
    );
    return () => window.clearTimeout(timer);
  }, [index, paused]);

  function move(step: number) {
    setIndex((value) => (value + step + banners.length) % banners.length);
  }

  return (
    <section
      ref={screen}
      className="home-carousel learning-motion"
      aria-label={
        vi
          ? 'Học lập trình, cộng tác và thành tích cùng CodeMark'
          : 'Learning, collaboration and achievements with CodeMark'
      }
      aria-roledescription={vi ? 'băng chuyền' : 'carousel'}
      data-paused={paused}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
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
            <Image
              src={banners[sceneIndex].src}
              alt={name}
              fill
              sizes="(max-width: 720px) 100vw, (max-width: 1440px) 85vw, 1152px"
              priority={sceneIndex === 0}
            />
          </div>
        ))}
      </div>
      <div className="home-carousel-controls">
        <div className="home-carousel-arrows">
          <button
            type="button"
            className="home-carousel-control"
            aria-label={vi ? 'Cảnh trước' : 'Previous scene'}
            onClick={() => move(-1)}
          >
            <i aria-hidden="true" className="fa-solid fa-chevron-left" />
          </button>
          <button
            type="button"
            className="home-carousel-control"
            aria-label={vi ? 'Cảnh tiếp theo' : 'Next scene'}
            onClick={() => move(1)}
          >
            <i aria-hidden="true" className="fa-solid fa-chevron-right" />
          </button>
        </div>
        <div
          role="group"
          aria-label={vi ? 'Chọn cảnh' : 'Choose scene'}
          className="home-carousel-dots"
        >
          {names.map((name, sceneIndex) => (
            <button
              key={sceneIndex}
              type="button"
              aria-label={`${vi ? 'Xem cảnh' : 'View scene'} ${sceneIndex + 1}: ${name}`}
              aria-current={sceneIndex === index ? 'true' : undefined}
              onClick={() => setIndex(sceneIndex)}
            >
              <span aria-hidden="true" />
            </button>
          ))}
        </div>
        <button
          type="button"
          className="home-carousel-control"
          onClick={() => setPlaying((value) => !value)}
          disabled={reducedMotion}
          aria-label={
            reducedMotion
              ? vi
                ? 'Chuyển động đã tắt theo cài đặt thiết bị'
                : 'Motion disabled by your device settings'
              : playing
                ? vi
                  ? 'Tạm dừng chuyển động và tự chuyển cảnh'
                  : 'Pause motion and automatic slides'
                : vi
                  ? 'Phát chuyển động và tự chuyển cảnh'
                  : 'Play motion and automatic slides'
          }
          aria-pressed={!playing}
        >
          <i
            aria-hidden="true"
            className={`fa-solid ${reducedMotion ? 'fa-leaf' : playing ? 'fa-pause' : 'fa-play'}`}
          />
        </button>
      </div>
    </section>
  );
}

