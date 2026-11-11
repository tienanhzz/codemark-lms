"use client";
import { useI18n } from "./LanguageProvider";

import { useEffect, useRef, useState } from "react";
import { SCENE_NAMES, TechnologyScene } from "./home/TechnologyScenes";

export function HomeCarousel() {
  const { tr } = useI18n();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [visible, setVisible] = useState(true);
  const [inView, setInView] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const screen = useRef<HTMLElement>(null);
  const paused = !playing || !visible || !inView;

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => {
      setReducedMotion(preference.matches);
      setPlaying(!preference.matches);
    };
    const syncVisibility = () => setVisible(!document.hidden);
    syncPreference();
    syncVisibility();
    preference.addEventListener("change", syncPreference);
    document.addEventListener("visibilitychange", syncVisibility);
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    if (screen.current) observer.observe(screen.current);
    return () => {
      preference.removeEventListener("change", syncPreference);
      document.removeEventListener("visibilitychange", syncVisibility);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (paused || hovered || focused) return;
    const timer = window.setTimeout(() => setIndex(value => (value + 1) % SCENE_NAMES.length), 8000);
    return () => window.clearTimeout(timer);
  }, [index, paused, hovered, focused]);

  function move(step: number) {
    setIndex(value => (value + step + SCENE_NAMES.length) % SCENE_NAMES.length);
  }

  const controlClass = "grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/15 bg-[#0b2036]/80 text-sm text-cyan-100 backdrop-blur-sm transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-200 disabled:cursor-default disabled:opacity-60";

  return (
    <section ref={screen} aria-label={tr("Cảnh công nghệ và trí tuệ nhân tạo trong vũ trụ")}
      aria-roledescription={tr("băng chuyền")} data-paused={paused}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
      className="learning-motion relative isolate overflow-hidden rounded-3xl border border-cyan-900/30 bg-[#061322] shadow-[0_18px_50px_-24px_rgba(8,47,73,0.55)]">
      <div className="relative h-[320px] sm:aspect-[50/27] sm:h-auto sm:min-h-[360px]">
        {SCENE_NAMES.map((name, sceneIndex) => (
          <div key={name} role="group" aria-roledescription={tr("cảnh")}
            aria-label={tr("Cảnh ") + (sceneIndex + 1) + " / " + SCENE_NAMES.length + ": " + tr(name)}
            aria-hidden={sceneIndex !== index} data-paused={paused || sceneIndex !== index}
            className={"learning-motion-slide pointer-events-none absolute inset-0 transition-opacity duration-1000 ease-in-out " + (sceneIndex === index ? "opacity-100" : "opacity-0")}>
            <TechnologyScene variant={sceneIndex} />
          </div>
        ))}
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between gap-2 bg-gradient-to-t from-[#061322]/90 to-transparent px-3 pb-3 pt-8 sm:px-5 sm:pb-5">
        <div className="flex items-center gap-1.5">
          <button type="button" aria-label={tr("Cảnh trước")} onClick={() => move(-1)} className={controlClass}>
            <i aria-hidden="true" className="fa-solid fa-chevron-left" />
          </button>
          <button type="button" aria-label={tr("Cảnh tiếp theo")} onClick={() => move(1)} className={controlClass}>
            <i aria-hidden="true" className="fa-solid fa-chevron-right" />
          </button>
        </div>
        <div role="group" aria-label={tr("Chọn cảnh")} className="flex items-center">
          {SCENE_NAMES.map((name, sceneIndex) => (
            <button key={name} type="button" aria-label={tr("Xem cảnh ") + (sceneIndex + 1) + ": " + tr(name)}
              aria-current={sceneIndex === index ? "true" : undefined} onClick={() => setIndex(sceneIndex)}
              className="grid h-10 w-8 place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-200 sm:w-10">
              <span aria-hidden="true" className={"h-1.5 rounded-full transition-all duration-500 " + (sceneIndex === index ? "w-5 bg-cyan-200" : "w-1.5 bg-white/35")} />
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setPlaying(value => !value)} disabled={reducedMotion}
          aria-label={reducedMotion ? tr("Chuyển động đã tắt theo cài đặt thiết bị") : playing ? tr("Tạm dừng chuyển động và tự chuyển cảnh") : tr("Phát chuyển động và tự chuyển cảnh")}
          aria-pressed={!playing} className={controlClass}>
          <i aria-hidden="true" className={"fa-solid " + (reducedMotion ? "fa-leaf" : playing ? "fa-pause" : "fa-play")} />
        </button>
      </div>
    </section>
  );
}
