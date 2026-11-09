"use client";

import { useId } from "react";

export const SCENE_NAMES = [
  "Mạng nơ-ron AI giữa các hành tinh",
  "Bộ xử lý lượng tử và các trường năng lượng",
  "Trái Đất số và mạng lưới vệ tinh",
  "Đài quan sát thiên hà và màn hình hologram",
];

export function TechnologyScene({ variant }: { variant: number }) {
  const gradientId = useId().replace(/:/g, "");
  const id = (name: string) => gradientId + "-" + name;
  const paint = (name: string) => "url(#" + id(name) + ")";

  if (variant === 0) return (
      <svg viewBox="0 0 1000 540" preserveAspectRatio="xMidYMid slice" role="img"
        aria-label={SCENE_NAMES[variant]}
        className="learning-motion-scene block h-full w-full">
        <defs>
          <radialGradient id={id("nebula")}><stop stopColor="#164e63" stopOpacity=".8" /><stop offset="1" stopColor="#061322" stopOpacity="0" /></radialGradient>
          <radialGradient id={id("purple")}><stop stopColor="#55378d" stopOpacity=".45" /><stop offset="1" stopColor="#061322" stopOpacity="0" /></radialGradient>
          <linearGradient id={id("screen")} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#163c52" /><stop offset="1" stopColor="#0b1a31" /></linearGradient>
          <linearGradient id={id("accent")} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#a5f3fc" /><stop offset=".5" stopColor="#22d3ee" /><stop offset="1" stopColor="#818cf8" /></linearGradient>
          <linearGradient id={id("planet")} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#c4b5fd" /><stop offset=".4" stopColor="#6d65b6" /><stop offset="1" stopColor="#182644" /></linearGradient>
          <linearGradient id={id("moon")} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#2d8192" /><stop offset=".45" stopColor="#154456" /><stop offset="1" stopColor="#071a2d" /></linearGradient>
          <linearGradient id={id("trail")}><stop stopColor="#22d3ee" stopOpacity="0" /><stop offset=".5" stopColor="#a5f3fc" /><stop offset="1" stopColor="#818cf8" stopOpacity="0" /></linearGradient>
          <linearGradient id={id("floor")} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#38bdf8" stopOpacity=".18" /><stop offset="1" stopColor="#38bdf8" stopOpacity="0" /></linearGradient>
        </defs>

        <ellipse cx="425" cy="278" rx="420" ry="270" fill={paint("nebula")} />
        <ellipse cx="775" cy="226" rx="325" ry="255" fill={paint("purple")} />
        <g fill="#c9edff" className="learning-motion-stars">
          <circle cx="104" cy="114" r="1.5" /><circle cx="164" cy="386" r="1.5" /><circle cx="247" cy="65" r="1.5" />
          <circle cx="367" cy="104" r="2" /><circle cx="569" cy="55" r="1.5" /><circle cx="637" cy="95" r="1" />
          <circle cx="738" cy="56" r="1.5" /><circle cx="906" cy="127" r="2" /><circle cx="941" cy="340" r="1.5" />
          <circle cx="858" cy="438" r="1" /><circle cx="708" cy="487" r="1.5" /><circle cx="345" cy="462" r="1" />
          <circle cx="94" cy="274" r="1" /><circle cx="460" cy="484" r="1.5" /><circle cx="902" cy="225" r="1" />
          <path d="M829 109v10m-5-5h10M221 342v12m-6-6h12M680 73v8m-4-4h8M133 204v8m-4-4h8" stroke="#a5f3fc" strokeWidth="1" />
        </g>
        <g fill="none" stroke={paint("floor")} strokeWidth="1">
          <path d="M500 350 80 540m420-190L240 540m260-190L400 540m100-190 60 190m-60-190 220 190m-220-190 380 190" />
          <path d="M335 380h330M260 414h480M170 460h660M80 510h840" />
        </g>
        <g fill="none" stroke="#67e8f9">
          <ellipse cx="500" cy="270" rx="374" ry="161" opacity=".13" transform="rotate(-15 500 270)" />
          <ellipse cx="500" cy="270" rx="330" ry="210" opacity=".08" transform="rotate(17 500 270)" />
          <ellipse className="learning-motion-orbit" cx="500" cy="270" rx="374" ry="161" stroke={paint("trail")} strokeWidth="2" strokeDasharray="30 210 6 150" transform="rotate(-15 500 270)" />
        </g>
        <g className="learning-motion-satellite">
          <circle cx="500" cy="270" r="230" fill="none" stroke="#a5f3fc" strokeOpacity=".04" />
          <circle cx="730" cy="270" r="11" fill="#22d3ee" opacity=".1" />
          <circle cx="730" cy="270" r="4" fill="#a5f3fc" />
          <circle cx="270" cy="270" r="3" fill="#c4b5fd" />
        </g>
        <g transform="translate(194 112)">
          <g className="learning-motion-float learning-motion-float-slow">
            <circle r="28" fill={paint("moon")} stroke="#67e8f9" strokeOpacity=".2" />
            <path d="M-21-12q24-5 43 6M-24 0q26-3 48 8M-15 16q20-2 31 4" fill="none" stroke="#67e8f9" strokeOpacity=".1" strokeWidth="3" />
            <circle cx="-8" cy="-9" r="5" fill="#a5f3fc" opacity=".06" />
          </g>
        </g>

        <ellipse cx="500" cy="451" rx="205" ry="25" fill="#020916" opacity=".65" />
        <g className="learning-motion-beacon" fill="none" stroke="#38bdf8">
          <ellipse cx="500" cy="449" rx="160" ry="16" strokeOpacity=".25" />
          <ellipse cx="500" cy="449" rx="133" ry="10" strokeOpacity=".1" />
        </g>
        <g transform="translate(278 145)">
          <g className="learning-motion-monitor">
            <rect x="-8" y="-8" width="460" height="274" rx="24" fill="#22d3ee" opacity=".04" />
            <rect width="444" height="258" rx="18" fill={paint("screen")} stroke="#56879f" strokeWidth="1.5" />
            <rect x="11" y="35" width="422" height="211" rx="10" fill="#071627" />
            <path d="M1 29h442" stroke="#7dd3fc" strokeOpacity=".15" />
            <circle cx="19" cy="15" r="3" fill="#a5f3fc" opacity=".7" /><circle cx="31" cy="15" r="3" fill="#67e8f9" opacity=".4" /><circle cx="43" cy="15" r="3" fill="#a5b4fc" opacity=".3" />
            <rect x="355" y="11" width="49" height="6" rx="3" fill="#67e8f9" opacity=".15" />
            <g fill="none" stroke="#67e8f9" strokeOpacity=".06">
              <path d="M35 62h374M35 96h374M35 130h374M35 164h374M35 198h374M35 232h374" />
              <path d="M52 48v184M86 48v184M120 48v184M154 48v184M188 48v184M222 48v184M256 48v184M290 48v184M324 48v184M358 48v184M392 48v184" />
            </g>
            <circle cx="222" cy="139" r="84" fill="#22d3ee" opacity=".025" />
            <circle cx="222" cy="139" r="72" fill="none" stroke="#67e8f9" strokeOpacity=".15" strokeDasharray="3 8" />
            <g fill="none" stroke={paint("accent")} strokeWidth="1.5" strokeOpacity=".55">
              <path d="M187 126h-32l-24-28H91M187 140h-46l-23 28H74M187 154h-21l-20 43h-31M209 104V76l-32-15M235 104V76l30-15M257 126h32l24-28h40M257 140h46l23 28h44M257 154h21l20 43h31M209 175v28l-28 18M235 175v28l28 18" />
              <path className="learning-motion-network" d="M91 98h40l24 28h32m70 14h46l23 28h44M177 61l32 15v28m26 71v28l28 18" stroke="#a5f3fc" strokeWidth="2.5" strokeOpacity="1" strokeDasharray="8 72" />
            </g>
            <g fill="#0b2439" stroke="#67e8f9" strokeWidth="1.5">
              <circle cx="91" cy="98" r="5" /><circle cx="74" cy="168" r="4" /><circle cx="115" cy="197" r="4" />
              <circle cx="177" cy="61" r="4" /><circle cx="265" cy="61" r="4" />
              <circle cx="353" cy="98" r="5" /><circle cx="370" cy="168" r="4" /><circle cx="329" cy="197" r="4" />
              <circle cx="181" cy="221" r="3" /><circle cx="263" cy="221" r="3" />
            </g>
            <rect x="179" y="96" width="86" height="86" rx="19" fill="#22d3ee" opacity=".07" />
            <rect x="187" y="104" width="70" height="70" rx="14" fill="#102e45" stroke={paint("accent")} strokeWidth="1.5" />
            <g fill="none" stroke="#a5f3fc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M222 118v42m-3-41c-8-5-14 1-13 7-7 2-9 10-4 15-3 7 1 14 8 14 1 6 6 8 12 5m3-41c8-5 14 1 13 7 7 2 9 10 4 15 3 7-1 14-8 14-1 6-6 8-12 5" />
              <path d="m207 128 7 4v7l-7 5m8-3 7 4m15-17-7 4v7l7 5m-8-3-7 4" />
            </g>
            <g className="learning-motion-beacon" fill="#a5f3fc">
              <circle cx="214" cy="132" r="2.5" /><circle cx="230" cy="139" r="2.5" /><circle cx="222" cy="145" r="2.5" />
            </g>
            <path d="M25 53v-8h18m376 8v-8h-18M25 224v9h18m376-9v9h-18" fill="none" stroke="#67e8f9" strokeOpacity=".5" strokeWidth="1.5" />
            <path d="m188 259-9 24h86l-9-24" fill="#14394c" stroke="#47778a" />
            <rect x="151" y="283" width="143" height="7" rx="3.5" fill="#315b72" />
          </g>
        </g>

        <g transform="translate(155 246)">
          <g className="learning-motion-float">
            <rect x="-13" y="-13" width="116" height="116" rx="22" fill="#0c263c" fillOpacity=".85" stroke="#497e9f" strokeOpacity=".5" />
            <g transform="translate(45 45)" fill="none" stroke="#67e8f9" strokeWidth="1.5">
              <ellipse rx="41" ry="15" transform="rotate(-30)" />
              <ellipse rx="41" ry="15" transform="rotate(30)" />
              <ellipse rx="41" ry="15" transform="rotate(90)" />
              <circle r="8" fill="#67e8f9" fillOpacity=".15" />
              <circle r="3" fill="#a5f3fc" />
            </g>
          </g>
        </g>
        <g transform="translate(802 185)">
          <g className="learning-motion-float learning-motion-float-delayed">
            <ellipse rx="78" ry="22" fill="none" stroke="#c4b5fd" strokeOpacity=".2" strokeWidth="8" transform="rotate(-24)" />
            <circle r="44" fill={paint("planet")} stroke="#c4b5fd" strokeOpacity=".3" />
            <path d="M-35-24q36-9 69 13M-41-9q45-1 82 21M-38 8q31 3 67 25" fill="none" stroke="#ddd6fe" strokeOpacity=".12" strokeWidth="4" />
            <path d="M-72 26c-7-11 20-30 62-47s81-22 84-12" fill="none" stroke="#c4b5fd" strokeWidth="2" transform="rotate(-5)" />
            <path d="M74-33c7 11-20 30-62 47s-81 22-84 12" fill="none" stroke="#c4b5fd" strokeWidth="3" transform="rotate(-5)" />
          </g>
        </g>
        <g transform="translate(754 361)">
          <g className="learning-motion-float learning-motion-float-slow" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="m0-27 48 27-48 27-48-27Z" fill="#182947" fillOpacity=".9" stroke="#818cf8" strokeOpacity=".7" />
            <path d="m-48 10 48 27 48-27m-96 20 48 27 48-27" stroke="#818cf8" strokeOpacity=".3" />
            <path d="m-17 0 17-10L17 0 0 10Z" fill="#a5b4fc" fillOpacity=".2" stroke="#c4b5fd" />
            <path d="M0-42v-14m44 24 12-8m-100 8-12-8" stroke="#a5b4fc" strokeOpacity=".45" />
          </g>
        </g>
        <g fill="none" stroke="#67e8f9" strokeOpacity=".4" strokeWidth="1.5" strokeLinecap="round">
          <path className="learning-motion-signal" d="M232 366q-19 39 27 55t47 5" strokeDasharray="3 14" />
          <path className="learning-motion-signal" d="M751 266q37 10 33 47" strokeDasharray="3 14" />
        </g>
      </svg>
  );

  return (
    <svg viewBox="0 0 1000 540" preserveAspectRatio="xMidYMid slice" role="img"
      aria-label={SCENE_NAMES[variant]} className="learning-motion-scene block h-full w-full">
        <defs>
          <radialGradient id={id("nebula")}><stop stopColor="#164e63" stopOpacity=".8" /><stop offset="1" stopColor="#061322" stopOpacity="0" /></radialGradient>
          <radialGradient id={id("purple")}><stop stopColor="#55378d" stopOpacity=".45" /><stop offset="1" stopColor="#061322" stopOpacity="0" /></radialGradient>
          <linearGradient id={id("screen")} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#163c52" /><stop offset="1" stopColor="#0b1a31" /></linearGradient>
          <linearGradient id={id("accent")} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#a5f3fc" /><stop offset=".5" stopColor="#22d3ee" /><stop offset="1" stopColor="#818cf8" /></linearGradient>
          <linearGradient id={id("planet")} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#c4b5fd" /><stop offset=".4" stopColor="#6d65b6" /><stop offset="1" stopColor="#182644" /></linearGradient>
          <linearGradient id={id("moon")} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#2d8192" /><stop offset=".45" stopColor="#154456" /><stop offset="1" stopColor="#071a2d" /></linearGradient>
          <linearGradient id={id("trail")}><stop stopColor="#22d3ee" stopOpacity="0" /><stop offset=".5" stopColor="#a5f3fc" /><stop offset="1" stopColor="#818cf8" stopOpacity="0" /></linearGradient>
          <linearGradient id={id("floor")} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#38bdf8" stopOpacity=".18" /><stop offset="1" stopColor="#38bdf8" stopOpacity="0" /></linearGradient>
        </defs>
      <ellipse cx="500" cy="280" rx="440" ry="270" fill={paint(variant === 1 ? "purple" : "nebula")} />
      <ellipse cx={variant === 3 ? 280 : 760} cy="220" rx="310" ry="230" fill={paint("purple")} />
      <g className="learning-motion-stars" fill="#c9edff">
        {[[135,125],[265,86],[435,64],[610,92],[787,88],[902,163],[851,431],[636,484],[352,461],[114,365],[915,307],[186,447]].map(([x,y], i) => <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 2 : 1.2} />)}
        <path d="M710 110v10m-5-5h10M160 280v10m-5-5h10M832 381v10m-5-5h10" stroke="#c4b5fd" />
      </g>
      <g fill="none" stroke="#818cf8" strokeOpacity=".14">
        <ellipse cx="500" cy="270" rx="365" ry="170" transform="rotate(-18 500 270)" />
        <ellipse cx="500" cy="270" rx="310" ry="212" transform="rotate(22 500 270)" />
        <ellipse className="learning-motion-orbit" cx="500" cy="270" rx="365" ry="170" transform="rotate(-18 500 270)" stroke={paint("trail")} strokeOpacity=".8" strokeDasharray="30 210 6 150" strokeWidth="2" />
      </g>
      <g className="learning-motion-satellite">
        <circle cx="748" cy="270" r="4" fill="#c4b5fd" /><circle cx="748" cy="270" r="11" fill="#818cf8" opacity=".12" />
        <circle cx="252" cy="270" r="3" fill="#67e8f9" />
      </g>
      <ellipse cx="500" cy="447" rx="205" ry="24" fill="#020916" opacity=".6" />
      <ellipse className="learning-motion-beacon" cx="500" cy="445" rx="163" ry="17" fill="none" stroke="#818cf8" strokeOpacity=".25" />

      {variant === 1 && <>
        <g fill="none" stroke="#818cf8" strokeOpacity=".2"><path d="M500 410 200 540m300-130L350 540m150-130 150 130m-150-130 300 130M330 450h340M260 490h480" /></g>
        <g className="learning-motion-monitor">
          <path d="m500 344 190 65-190 65-190-65Z" fill="#121f3e" stroke="#6873b2" strokeOpacity=".5" />
          <path d="m310 409 190 65 190-65v12l-190 65-190-65Z" fill="#0b152a" />
          <rect x="325" y="135" width="350" height="247" rx="24" fill={paint("screen")} stroke="#9492da" strokeOpacity=".7" />
          <rect x="337" y="147" width="326" height="223" rx="16" fill="#0b1429" />
          <circle cx="500" cy="259" r="94" fill="#818cf8" opacity=".04" />
          <circle cx="500" cy="259" r="83" fill="none" stroke="#a5b4fc" strokeOpacity=".24" strokeDasharray="2 8" />
          <g fill="none" stroke="#a5b4fc" strokeWidth="1.5" strokeOpacity=".55">
            <path d="m500 193 57 33v66l-57 33-57-33v-66Z" />
            <path d="M500 193v-26m57 59 28-16m-28 82 28 16m-85 17v27m-57-60-28 16m28-82-28-16" />
            <path className="learning-motion-network" d="m500 167 0 26 57 33v66l-57 33-57-33v-66l57-33" stroke="#ddd6fe" strokeWidth="3" strokeDasharray="8 72" />
          </g>
          <rect x="474" y="233" width="52" height="52" rx="12" fill="#282e56" stroke="#c4b5fd" />
          <path d="m500 242 16 17-16 17-16-17Z" fill="#c4b5fd" fillOpacity=".18" stroke="#e9d5ff" />
          <g className="learning-motion-beacon" fill="#e9d5ff">{[[500,167],[585,210],[585,308],[500,352],[415,308],[415,210]].map(([x,y],i) => <circle key={i} cx={x} cy={y} r="4" />)}</g>
          <ellipse cx="500" cy="259" rx="123" ry="28" fill="none" stroke="#67e8f9" strokeOpacity=".35" transform="rotate(-30 500 259)" />
          <ellipse className="learning-motion-orbit" cx="500" cy="259" rx="123" ry="28" fill="none" stroke="#67e8f9" strokeWidth="2" strokeDasharray="30 210 6 150" transform="rotate(30 500 259)" />
        </g>
        <g transform="translate(207 263)"><g className="learning-motion-float" fill="#0c2137" stroke="#67e8f9" strokeWidth="1.5">
          <path d="m0-30 27 15v30L0 30-27 15v-30Zm0 30 27-15M0 0v30M0 0l-27-15" />
          <circle cx="-43" cy="-45" r="8" /><circle cx="43" cy="45" r="8" /><path d="m-35-37 12 13m46 48 12 13" />
        </g></g>
        <g transform="translate(792 310)"><g className="learning-motion-float learning-motion-float-delayed" fill="none" stroke="#c4b5fd">
          <ellipse rx="47" ry="18" /><ellipse rx="47" ry="18" transform="rotate(60)" /><ellipse rx="47" ry="18" transform="rotate(120)" /><circle r="5" fill="#ddd6fe" />
        </g></g>
      </>}

      {variant === 2 && <>
        <g className="learning-motion-monitor">
          <rect x="267" y="128" width="466" height="277" rx="23" fill={paint("screen")} stroke="#4b9baf" strokeWidth="1.5" />
          <rect x="279" y="140" width="442" height="250" rx="15" fill="#071b2a" />
          <path d="M291 156h32m354 0h32M291 374h32m354 0h32" stroke="#67e8f9" strokeOpacity=".4" />
          <circle cx="500" cy="265" r="99" fill={paint("moon")} stroke="#67e8f9" strokeOpacity=".5" />
          <g fill="none" stroke="#67e8f9" strokeOpacity=".25">
            <ellipse cx="500" cy="265" rx="40" ry="99" /><ellipse cx="500" cy="265" rx="77" ry="99" />
            <ellipse cx="500" cy="265" rx="99" ry="37" /><ellipse cx="500" cy="265" rx="92" ry="71" />
            <path d="M401 265h198m-99-99v198" />
          </g>
          <path d="m455 196 30 8 10 20-15 13 6 18-22 14-6 23-17-15 4-23-19-11 5-26Zm76 48 28-12 26 15-5 24-23 8-11 32-17 11-14-19 9-28Z" fill="#67e8f9" opacity=".18" />
          <g fill="none" stroke="#a5f3fc" strokeOpacity=".65">
            <path d="M452 230q47-59 109 18M452 230q-15 80 77 73m32-55q36 49-32 55" />
            <path className="learning-motion-network" d="M452 230q47-59 109 18m-109-18q-15 80 77 73" strokeWidth="2.5" strokeDasharray="8 72" />
          </g>
          <g className="learning-motion-beacon" fill="#a5f3fc"><circle cx="452" cy="230" r="5" /><circle cx="561" cy="248" r="4" /><circle cx="529" cy="303" r="4" /></g>
          <ellipse cx="500" cy="265" rx="151" ry="39" fill="none" stroke="#5eead4" strokeOpacity=".3" transform="rotate(-24 500 265)" />
          <path d="m464 406-10 25h92l-10-25" fill="#14394c" stroke="#47778a" /><rect x="423" y="431" width="154" height="7" rx="3.5" fill="#315b72" />
        </g>
        {[[188,203,-22],[807,330,25]].map(([x,y,angle],i) => <g key={i} transform={"translate(" + x + " " + y + ") rotate(" + angle + ")"}><g className={"learning-motion-float " + (i ? "learning-motion-float-delayed" : "")}>
          <rect x="-58" y="-17" width="39" height="34" rx="3" fill="#153d58" stroke="#67e8f9" strokeOpacity=".6" />
          <rect x="19" y="-17" width="39" height="34" rx="3" fill="#153d58" stroke="#67e8f9" strokeOpacity=".6" />
          <path d="M-45-17v34m13-34v34m64-34v34m13-34v34M-58 0h39m38 0h39" stroke="#67e8f9" strokeOpacity=".25" />
          <rect x="-13" y="-18" width="26" height="36" rx="7" fill="#22485a" stroke="#a5f3fc" />
          <path d="M0-18v-14m-12-4q12-10 24 0" fill="none" stroke="#a5f3fc" strokeWidth="2" /><circle cy="-34" r="3" fill="#67e8f9" />
        </g></g>)}
        <path className="learning-motion-signal" d="M228 189q71-79 134-53M770 345q-50 72-103 72" fill="none" stroke="#5eead4" strokeOpacity=".45" strokeDasharray="3 14" />
      </>}

      {variant === 3 && <>
        <g className="learning-motion-monitor">
          <path d="M392 335 466 162h68l74 173Z" fill="#818cf8" opacity=".035" />
          <path d="m392 335 74-173m142 173-74-173" stroke="#a5b4fc" strokeOpacity=".12" />
          <rect x="329" y="295" width="342" height="136" rx="17" fill={paint("screen")} stroke="#8794c9" strokeOpacity=".7" />
          <rect x="341" y="307" width="318" height="111" rx="10" fill="#0a142c" />
          <g fill="none" stroke="#a5b4fc" strokeOpacity=".17"><path d="M359 330h282m-282 24h282m-282 24h282M396 320v84m52-84v84m52-84v84m52-84v84m52-84v84" /></g>
          <ellipse cx="500" cy="365" rx="88" ry="30" fill="#a5b4fc" opacity=".05" />
          <ellipse cx="500" cy="365" rx="88" ry="30" fill="none" stroke="#a5b4fc" strokeOpacity=".35" />
          <ellipse className="learning-motion-orbit" cx="500" cy="365" rx="61" ry="20" fill="none" stroke="#a5f3fc" strokeDasharray="30 210 6 150" />
          <path d="m329 430-35 18h412l-35-18" fill="#22354b" stroke="#64748b" strokeOpacity=".5" />
        </g>
        <g transform="translate(500 224)"><g className="learning-motion-float learning-motion-float-slow">
          <circle r="49" fill={paint("planet")} stroke="#c4b5fd" strokeOpacity=".4" />
          <ellipse rx="116" ry="34" fill="none" stroke="#c4b5fd" strokeOpacity=".25" strokeWidth="9" transform="rotate(-22)" />
          <ellipse rx="116" ry="34" fill="none" stroke="#c4b5fd" strokeOpacity=".65" strokeWidth="1.5" transform="rotate(-22)" />
          <ellipse rx="82" ry="67" fill="none" stroke="#67e8f9" strokeOpacity=".15" transform="rotate(26)" />
          <circle cx="-91" cy="36" r="5" fill="#67e8f9" />
        </g></g>
        <g transform="translate(774 187) rotate(26)"><g className="learning-motion-float">
          <path d="M0-45c-24 20-23 48-15 66h30C23 3 24-25 0-45Z" fill="#1b3551" stroke="#a5b4fc" strokeWidth="1.5" />
          <path d="m-17 1-16 24 18-4m32-20 16 24-18-4" fill="#33426a" stroke="#818cf8" />
          <circle cy="-13" r="9" fill="#0b1b30" stroke="#67e8f9" strokeWidth="2" />
          <path className="learning-motion-beacon" d="m-8 27 8 29 8-29" fill="#67e8f9" fillOpacity=".25" stroke="#a5f3fc" strokeOpacity=".5" />
        </g></g>
        <g transform="translate(206 304)"><g className="learning-motion-float learning-motion-float-delayed">
          <path d="m0-46 40 23v46L0 46-40 23v-46Z" fill="#101e35" stroke="#a5b4fc" strokeOpacity=".4" />
          <circle r="22" fill="none" stroke="#818cf8" strokeOpacity=".6" /><path d="m-13 0 13-13L13 0 0 13Z" fill="#818cf8" fillOpacity=".2" stroke="#c4b5fd" />
        </g></g>
        <path className="learning-motion-signal" d="M265 344q-7 68 48 68M680 137q17-28 49-26" fill="none" stroke="#a5b4fc" strokeOpacity=".4" strokeDasharray="3 14" />
      </>}
    </svg>
  );
}
