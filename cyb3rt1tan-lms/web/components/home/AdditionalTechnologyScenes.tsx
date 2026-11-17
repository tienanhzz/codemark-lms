type Props = { variant: number; paint: (name: string) => string };

export function AdditionalTechnologyScene({ variant, paint }: Props) {
  if (variant === 4) return (
    <>
      <g className="learning-motion-monitor">
        <rect x="278" y="132" width="444" height="278" rx="22" fill={paint('screen')} stroke="#67e8f9" strokeOpacity=".65" />
        <path d="M278 170h444" stroke="#67e8f9" strokeOpacity=".25" />
        {[298, 312, 326].map(x => <circle key={x} cx={x} cy="151" r="4" fill="#a5b4fc" />)}
        <rect x="294" y="186" width="198" height="205" rx="10" fill="#071627" />
        {[66, 126, 96, 144, 78, 116, 58].map((width, i) => (
          <g key={i}>
            <circle cx="308" cy={207 + i * 25} r="2" fill="#47778a" />
            <path className="learning-motion-network" d={`M323 ${207 + i * 25}h${width}`} stroke={i % 2 ? '#c4b5fd' : '#67e8f9'} strokeWidth="5" strokeLinecap="round" strokeDasharray="8 72" />
          </g>
        ))}
        <rect x="508" y="186" width="198" height="110" rx="10" fill="#164e63" />
        <circle className="learning-motion-beacon" cx="664" cy="216" r="15" fill="#fde68a" />
        <path d="m508 280 55-55 41 45 39-27 63 53H508Z" fill="#22d3ee" fillOpacity=".3" />
        {[508, 578, 648].map((x, i) => <rect key={x} x={x} y="310" width="58" height="47" rx="8" fill={i === 1 ? '#818cf8' : '#22d3ee'} fillOpacity=".3" />)}
        <path d="M511 374h130" stroke="#a5f3fc" strokeOpacity=".4" strokeWidth="5" strokeLinecap="round" />
        <path d="m462 411-10 23h96l-10-23" fill="#22485a" stroke="#67e8f9" strokeOpacity=".4" />
        <rect x="420" y="434" width="160" height="7" rx="3" fill="#315b72" />
      </g>
      <g transform="translate(185 260)"><g className="learning-motion-float">
        <rect x="-44" y="-48" width="88" height="96" rx="18" fill="#102a40" stroke="#67e8f9" strokeOpacity=".5" />
        <path d="m-15-17-17 17 17 17m30-34 17 17-17 17M7-25-7 25" fill="none" stroke="#a5f3fc" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </g></g>
      <g transform="translate(813 270)"><g className="learning-motion-float learning-motion-float-delayed">
        <path d="m0-46 40 23v46L0 46-40 23v-46Z" fill="#182947" stroke="#a5b4fc" />
        <path d="m-16 0 11 12 23-25" fill="none" stroke="#5eead4" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </g></g>
      <path className="learning-motion-signal" d="M225 260h53m444 0h48" fill="none" stroke="#67e8f9" strokeDasharray="3 14" />
    </>
  );

  if (variant === 5) return (
    <>
      <g className="learning-motion-monitor">
        <path d="M500 307q-99-62-207-24v126q107-30 207 30 100-60 207-30V283q-108-38-207 24Z" fill={paint('screen')} stroke="#a5b4fc" strokeWidth="2" />
        <path d="M500 315q-95-54-193-22v103q98-23 193 30 95-53 193-30V293q-98-32-193 22Z" fill="#102a40" />
        <path d="M500 307v132" stroke="#a5b4fc" strokeWidth="2" />
        {[0, 1, 2, 3].map(i => <g key={i} fill="none" stroke="#67e8f9" strokeOpacity=".5" strokeWidth="3" strokeLinecap="round">
          <path d={`M330 ${315 + i * 22}q64-8 140 26`} />
          <path d={`M530 ${341 + i * 22}q76-34 140-26`} />
        </g>)}
        <path className="learning-motion-network" d="M330 315q64-8 140 26m60 0q76-34 140-26" fill="none" stroke="#e0f2fe" strokeWidth="4" strokeDasharray="8 72" />
      </g>
      <g transform="translate(500 194)"><g className="learning-motion-float">
        <path d="m-108-10 108-48L108-10 0 37Z" fill="#33426a" stroke="#c4b5fd" strokeWidth="2" />
        <path d="M-63 12v39q63 35 126 0V12L0 40Z" fill="#182947" stroke="#818cf8" />
        <path d="M0-10h99v74" fill="none" stroke="#fbbf24" strokeWidth="3" />
        <path className="learning-motion-beacon" d="m99 64-8 25h16Z" fill="#fbbf24" />
      </g></g>
      {[205, 795].map((x, i) => <g key={x} transform={`translate(${x} ${i ? 290 : 224})`}>
        <g className={`learning-motion-float ${i ? 'learning-motion-float-delayed' : 'learning-motion-float-slow'}`}>
          <path d="m-24 18-7 50 31-14 31 14-7-50" fill="#51417c" stroke="#a5b4fc" />
          <circle r="36" fill="#162f43" stroke="#fde68a" strokeWidth="2" />
          <path d="m0-20 6 13 15 2-11 11 3 15L0 14-13 7l3-15-11-11 15-2Z" transform="translate(0 10)" fill="#fde68a" fillOpacity=".8" />
        </g>
      </g>)}
      <path className="learning-motion-signal" d="M245 224q58-84 139-53m230 40q100-10 143 48" fill="none" stroke="#a5b4fc" strokeDasharray="3 14" />
    </>
  );

  if (variant === 6) return (
    <>
      <g className="learning-motion-monitor">
        <path d="M500 151v-25" stroke="#a5b4fc" strokeWidth="5" />
        <circle className="learning-motion-beacon" cx="500" cy="117" r="9" fill="#5eead4" />
        <rect x="405" y="153" width="190" height="132" rx="43" fill={paint('screen')} stroke="#a5f3fc" strokeWidth="2" />
        <rect x="424" y="174" width="152" height="82" rx="26" fill="#071627" />
        <g className="learning-motion-beacon" fill="#67e8f9">
          <rect x="448" y="197" width="18" height="25" rx="9" />
          <rect x="534" y="197" width="18" height="25" rx="9" />
        </g>
        <path d="M479 234q21 14 42 0" fill="none" stroke="#67e8f9" strokeWidth="3" strokeLinecap="round" />
        <rect x="397" y="291" width="206" height="119" rx="34" fill={paint('screen')} stroke="#818cf8" strokeWidth="2" />
        <circle cx="500" cy="344" r="28" fill="#0b2439" stroke="#67e8f9" />
        <path className="learning-motion-network" d="M475 344h50m-25-25v50" stroke="#a5f3fc" strokeWidth="3" strokeDasharray="8 72" />
        <rect x="425" y="414" width="57" height="24" rx="12" fill="#315b72" />
        <rect x="518" y="414" width="57" height="24" rx="12" fill="#315b72" />
      </g>
      {[370, 630].map((x, i) => <g key={x} transform={`translate(${x} 315)`}>
        <g className={`learning-motion-float ${i ? 'learning-motion-float-delayed' : ''}`}>
          <rect x="-15" y="-12" width="30" height="80" rx="15" fill="#22485a" stroke="#67e8f9" transform={`rotate(${i ? -30 : 30})`} />
          <circle cx={i ? 34 : -34} cy="62" r="17" fill="#315b72" stroke="#a5b4fc" />
        </g>
      </g>)}
      {[205, 795].map((x, i) => <g key={x} transform={`translate(${x} ${i ? 210 : 230})`}>
        <g className="learning-motion-float learning-motion-float-slow">
          <path d="M-58-38H58v65H4l-23 19V27h-39Z" fill="#142b42" stroke="#a5b4fc" strokeOpacity=".6" />
          <path d={i ? 'm-18-6 12 12 25-25' : 'M-33-15h66m-66 18h44'} fill="none" stroke={i ? '#5eead4' : '#67e8f9'} strokeWidth="4" strokeLinecap="round" />
        </g>
      </g>)}
    </>
  );

  if (variant === 7) return (
    <>
      <g className="learning-motion-float">
        <path d="M407 265h181c68 0 72-93 10-101-29-76-135-68-160-1-63-11-90 68-31 102Z" fill={paint('screen')} stroke="#a5f3fc" strokeWidth="2" />
        <path d="m475 213 25-26 25 26m-25-25v53" fill="none" stroke="#67e8f9" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <circle className="learning-motion-beacon" cx="584" cy="218" r="10" fill="#5eead4" fillOpacity=".6" />
      </g>
      <g fill="none" stroke="#818cf8" strokeOpacity=".35" strokeWidth="2">
        <path d="M440 267v27H350v37m150-64v64m60-64v27h90v37" />
        <path className="learning-motion-network" d="M440 267v27H350v37m150-64v64m60-64v27h90v37" stroke="#a5f3fc" strokeOpacity="1" strokeDasharray="8 72" />
      </g>
      {[300, 450, 600].map((x, i) => <g key={x} transform={`translate(${x} 333)`}>
        <g className={i === 1 ? 'learning-motion-float learning-motion-float-delayed' : 'learning-motion-monitor'}>
          <rect width="100" height="99" rx="13" fill={paint('screen')} stroke="#818cf8" />
          {[16, 43, 70].map(y => <g key={y}>
            <rect x="10" y={y} width="80" height="18" rx="5" fill="#0b1a31" stroke="#67e8f9" strokeOpacity=".25" />
            <circle className="learning-motion-beacon" cx="22" cy={y + 9} r="3" fill="#5eead4" />
            <path d={`M40 ${y + 9}h38`} stroke="#818cf8" strokeWidth="2" />
          </g>)}
        </g>
      </g>)}
      <g transform="translate(200 243)"><g className="learning-motion-float learning-motion-float-slow">
        <path d="m0-47 36 16v40Q36 37 0 55-36 37-36 9v-40Z" fill="#112c40" stroke="#5eead4" strokeWidth="2" />
        <path d="m-15 0 11 12 22-26" fill="none" stroke="#a5f3fc" strokeWidth="4" strokeLinecap="round" />
      </g></g>
      <g transform="translate(800 243)"><g className="learning-motion-float learning-motion-float-delayed" fill="none" stroke="#a5b4fc" strokeWidth="2">
        <ellipse cy="-25" rx="37" ry="15" fill="#182947" />
        <path d="M-37-25v60c0 20 74 20 74 0v-60m-74 20c0 20 74 20 74 0m-74 20c0 20 74 20 74 0" />
      </g></g>
    </>
  );

  return null;
}
