"use client";

import { useEffect, useState } from "react";

const slides = [
  { image: "/home/learning.svg", tag: "HỌC TẬP MỖI NGÀY", title: "Kiến thức hôm nay.\nCơ hội ngày mai.", text: "Một nơi để học hỏi, thực hành và tự tin chinh phục mục tiêu.", alt: "Minh họa sách, máy tính và những ý tưởng học tập" },
  { image: "/home/community.svg", tag: "KẾT NỐI CỘNG ĐỒNG", title: "Cùng nhau học.\nCùng nhau tiến bộ.", text: "Kết nối với giảng viên, theo dõi lớp học và không bỏ lỡ thông tin mới.", alt: "Minh họa các thành viên kết nối trong cộng đồng học tập" },
  { image: "/home/progress.svg", tag: "GHI NHẬN NỖ LỰC", title: "Từng bước nhỏ.\nThành tích lớn.", text: "Hoàn thành bài tập, thử sức với bài thi và theo dõi thứ hạng của bạn.", alt: "Minh họa chiếc cúp trên các bậc tiến bộ" },
];

export function HomeCarousel() {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    setPlaying(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);
  useEffect(() => {
    if (!playing || hovered || focused) return;
    const timer = window.setInterval(() => setIndex(value => (value + 1) % slides.length), 6000);
    return () => window.clearInterval(timer);
  }, [playing, hovered, focused]);
  const slide = slides[index];
  return <section aria-label="Hình ảnh nổi bật" aria-roledescription="băng chuyền" className="relative overflow-hidden rounded-3xl bg-[#123b42] text-white"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <div className="grid min-h-[360px] items-center gap-4 p-7 pb-16 sm:p-10 sm:pb-16 md:grid-cols-2" aria-live={playing ? "off" : "polite"}>
      <div><p className="text-[11px] font-bold tracking-[0.22em] text-teal-200">{slide.tag}</p>
        <h2 className="mt-5 whitespace-pre-line text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{slide.title}</h2>
        <p className="mt-5 max-w-md text-sm leading-7 text-teal-100/80">{slide.text}</p>
      </div>
      <img key={slide.image} src={slide.image} alt={slide.alt} width={600} height={400} className="mx-auto h-44 w-full object-contain sm:h-64"/>
    </div>
    <button type="button" onClick={() => setPlaying(!playing)}
      aria-label={playing ? "Dừng tự chuyển ảnh" : "Bật tự chuyển ảnh"}
      title={playing ? "Dừng tự chuyển ảnh" : "Bật tự chuyển ảnh"}
      className="absolute bottom-4 right-5 grid h-9 w-9 place-items-center rounded-full text-teal-100 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-200">
      <i aria-hidden="true" className={`fa-solid ${playing ? "fa-pause" : "fa-play"}`}/>
    </button>
  </section>;
}
