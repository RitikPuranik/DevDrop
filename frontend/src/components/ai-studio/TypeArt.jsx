import React from 'react';

// Flat, hand-drawn SVG "mini websites" — one per AI Studio website type.
// No glows or gradients: just calm shapes in the studio palette plus one accent.

const INK = '#14130f';
const CREAM = '#e8e2d6';
const W = 320;
const H = 190;

const ACCENTS = {
  portfolio: '#cbb392',
  ecommerce: '#e8a87c',
  blog: '#9fb4d8',
  landing: '#b8a4f0',
  cafe: '#d9a066',
  hotel: '#7fc8c0',
  studio: '#f0a0b8',
  event: '#e8d070',
  education: '#8fd49b',
  custom: '#e8e2d6',
};

const Line = ({ x, y, w, h = 4, o = 0.18, fill = CREAM }) => (
  <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={fill} opacity={o} />
);

const star = (cx, cy, r) =>
  `M${cx} ${cy - r}Q${cx} ${cy} ${cx + r} ${cy}Q${cx} ${cy} ${cx} ${cy + r}Q${cx} ${cy} ${cx - r} ${cy}Q${cx} ${cy} ${cx} ${cy - r}Z`;

function Frame({ accent, children }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden="true">
      <rect width={W} height={H} fill={accent} opacity="0.07" />
      <rect x="36" y="22" width="248" height="200" rx="12" fill={INK} stroke={CREAM} strokeOpacity="0.14" />
      <path d="M36 40.5h248" stroke={CREAM} strokeOpacity="0.09" />
      <circle cx="49" cy="31" r="2.6" fill={CREAM} opacity="0.25" />
      <circle cx="58" cy="31" r="2.6" fill={CREAM} opacity="0.25" />
      <circle cx="67" cy="31" r="2.6" fill={CREAM} opacity="0.25" />
      <rect x="112" y="26" width="96" height="9" rx="4.5" fill={CREAM} opacity="0.07" />
      {children}
    </svg>
  );
}

const ART = {
  portfolio: (a) => (
    <>
      <circle cx="72" cy="74" r="17" fill={a} />
      <circle cx="72" cy="70" r="5.5" fill={INK} />
      <path d="M61 85c2-6 20-6 22 0" stroke={INK} strokeWidth="5" strokeLinecap="round" fill="none" />
      <Line x={98} y={62} w={74} h={8} o={0.55} />
      <Line x={98} y={77} w={52} h={4} />
      <Line x={98} y={86} w={64} h={4} />
      <rect x="214" y="66" width="58" height="20" rx="10" fill={a} />
      {[0.22, 0.34, 0.48].map((o, i) => {
        const x = 48 + i * 78;
        return (
          <g key={i}>
            <rect x={x} y="108" width="68" height="80" rx="8" fill={a} opacity={o} />
            {i === 0 && <circle cx={x + 34} cy="130" r="11" fill={INK} opacity="0.35" />}
            {i === 1 && <path d={`M${x + 20} 142l14-24 14 24z`} fill={INK} opacity="0.35" />}
            {i === 2 && <rect x={x + 22} y="120" width="24" height="22" rx="4" fill={INK} opacity="0.35" />}
            <Line x={x + 8} y={158} w={38} o={0.55} />
            <Line x={x + 8} y={168} w={24} h={3} o={0.3} />
          </g>
        );
      })}
    </>
  ),

  ecommerce: (a) => (
    <>
      <Line x={48} y={49} w={32} h={6} o={0.5} />
      <Line x={96} y={50} w={22} o={0.2} />
      <Line x={124} y={50} w={22} o={0.2} />
      <rect x="248" y="47" width="16" height="11" rx="3" fill="none" stroke={CREAM} strokeOpacity="0.5" strokeWidth="1.4" />
      <circle cx="265" cy="46" r="5" fill={a} />
      {[0.22, 0.34, 0.2].map((o, i) => {
        const x = 48 + i * 78;
        return (
          <g key={i}>
            <rect x={x} y="68" width="68" height="120" rx="8" fill={CREAM} opacity="0.05" />
            <rect x={x} y="68" width="68" height="56" rx="8" fill={a} opacity={o + 0.08} />
            {i === 0 && <circle cx={x + 34} cy="96" r="14" fill={a} />}
            {i === 1 && <rect x={x + 20} y="82" width="28" height="28" rx="7" fill={a} />}
            {i === 2 && <path d={`M${x + 18} 110l16-28 16 28z`} fill={a} />}
            <Line x={x + 6} y={132} w={46} o={0.5} />
            <Line x={x + 6} y={141} w={30} h={3} o={0.22} />
            <rect x={x + 6} y="152" width="28" height="11" rx="5.5" fill={a} />
            <circle cx={x + 56} cy="157.5" r="7" fill={CREAM} opacity="0.14" />
            <path d={`M${x + 53} 157.5h6M${x + 56} 154.5v6`} stroke={CREAM} strokeWidth="1.3" strokeLinecap="round" />
          </g>
        );
      })}
    </>
  ),

  blog: (a) => (
    <>
      <Line x={112} y={49} w={96} h={8} o={0.55} />
      <rect x="48" y="64" width="224" height="1" fill={CREAM} opacity="0.3" />
      <rect x="48" y="67" width="224" height="1" fill={CREAM} opacity="0.15" />
      <rect x="48" y="76" width="108" height="64" rx="7" fill={a} opacity="0.3" />
      <circle cx="132" cy="94" r="7" fill={a} />
      <path d="M48 140l32-34 22 22 18-14 36 26z" fill={a} opacity="0.6" />
      <Line x={48} y={148} w={100} h={6} o={0.55} />
      <Line x={48} y={159} w={108} h={3} />
      <Line x={48} y={166} w={90} h={3} />
      <Line x={48} y={173} w={100} h={3} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x="170" y={76 + i * 32} width="30" height="26" rx="5" fill={a} opacity={0.2 + i * 0.1} />
          <Line x={208} y={78 + i * 32} w={62} o={0.5} />
          <Line x={208} y={88 + i * 32} w={48} h={3} />
          <Line x={208} y={95 + i * 32} w={55} h={3} />
        </g>
      ))}
    </>
  ),

  landing: (a) => (
    <>
      <Line x={48} y={48} w={26} h={6} o={0.55} />
      <Line x={196} y={49} w={20} o={0.2} />
      <Line x={222} y={49} w={20} o={0.2} />
      <rect x="248" y="45" width="24" height="11" rx="5.5" fill={a} />
      <Line x={84} y={68} w={152} h={11} o={0.6} />
      <Line x={112} y={85} w={96} h={11} o={0.6} />
      <Line x={104} y={104} w={112} h={4} />
      <Line x={122} y={112} w={76} h={4} />
      <rect x="112" y="124" width="52" height="20" rx="10" fill={a} />
      <rect x="170" y="124" width="38" height="20" rx="10" fill="none" stroke={CREAM} strokeOpacity="0.3" />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x={48 + i * 78} y="156" width="68" height="40" rx="8" fill={CREAM} opacity="0.05" />
          <circle cx={62 + i * 78} cy="170" r="6" fill={a} opacity={0.5 + i * 0.2} />
          <Line x={74 + i * 78} y={167} w={34} o={0.4} />
          <Line x={56 + i * 78} y={182} w={50} h={3} />
        </g>
      ))}
    </>
  ),

  cafe: (a) => (
    <>
      <circle cx="88" cy="112" r="42" fill={a} opacity="0.16" stroke={a} strokeOpacity="0.4" />
      <rect x="68" y="100" width="40" height="32" rx="9" fill={a} />
      <path d="M108 108c14 0 14 18 0 18" stroke={a} strokeWidth="5" fill="none" strokeLinecap="round" />
      <rect x="62" y="134" width="52" height="5" rx="2.5" fill={a} opacity="0.7" />
      {[78, 88, 98].map((x, i) => (
        <path key={x} className="ta-steam" style={{ animationDelay: `${i * 0.5}s` }} d={`M${x} 94c-4-5 4-8 0-13`} stroke={CREAM} strokeOpacity="0.55" strokeWidth="2" fill="none" strokeLinecap="round" />
      ))}
      <Line x={148} y={52} w={40} h={5} o={0.35} fill={a} />
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <Line x={148} y={68 + i * 20} w={[56, 44, 62, 50, 40][i]} h={5} o={0.55} />
          <path d={`M${[210, 198, 216, 204, 194][i]} ${71 + i * 20}h${[32, 44, 26, 38, 48][i]}`} stroke={CREAM} strokeOpacity="0.2" strokeDasharray="1.5 3" strokeLinecap="round" />
          <Line x={250} y={68 + i * 20} w={22} h={5} o={0.9} fill={a} />
        </g>
      ))}
    </>
  ),

  hotel: (a) => (
    <>
      <rect x="48" y="48" width="224" height="68" rx="9" fill={a} opacity="0.2" />
      <circle cx="238" cy="68" r="10" fill={a} />
      <path d="M48 116l48-40 38 28 40-34 98 46z" fill={a} opacity="0.55" />
      <path d="M48 116l36-22 30 22z" fill={a} opacity="0.35" />
      <rect x="66" y="98" width="188" height="26" rx="13" fill={INK} stroke={CREAM} strokeOpacity="0.2" />
      <Line x={82} y={108} w={34} h={5} o={0.45} />
      <Line x={134} y={108} w={34} h={5} o={0.45} />
      <Line x={186} y={108} w={26} h={5} o={0.45} />
      <circle cx="238" cy="111" r="9" fill={a} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x={48 + i * 78} y="136" width="68" height="52" rx="8" fill={CREAM} opacity="0.05" />
          <rect x={48 + i * 78} y="136" width="68" height="28" rx="8" fill={a} opacity={0.2 + i * 0.1} />
          <Line x={56 + i * 78} y={171} w={38} o={0.5} />
          <Line x={56 + i * 78} y={180} w={24} h={3} />
        </g>
      ))}
    </>
  ),

  studio: (a) => (
    <>
      <Line x={48} y={58} w={96} h={10} o={0.6} />
      <Line x={48} y={74} w={72} h={10} o={0.6} />
      <Line x={48} y={94} w={104} h={4} />
      <Line x={48} y={102} w={84} h={4} />
      <rect x="48" y="116" width="62" height="20" rx="10" fill={a} />
      <rect x="116" y="116" width="40" height="20" rx="10" fill="none" stroke={CREAM} strokeOpacity="0.3" />
      <g transform="rotate(-7 220 96)">
        <rect x="176" y="56" width="92" height="66" rx="9" fill={a} opacity="0.3" />
      </g>
      <g transform="rotate(4 220 96)">
        <rect x="178" y="62" width="92" height="66" rx="9" fill="#1d1b16" stroke={CREAM} strokeOpacity="0.2" />
        <circle cx="198" cy="82" r="8" fill={a} />
        <Line x={212} y={78} w={44} o={0.5} />
        <Line x={212} y={87} w={30} h={3} />
        <rect x="190" y="98" width="68" height="22" rx="5" fill={a} opacity="0.35" />
      </g>
      <Line x={48} y={150} w={34} h={3} o={0.25} />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={48 + i * 46} y="162" width="34" height="14" rx="7" fill={CREAM} opacity="0.1" />
      ))}
    </>
  ),

  event: (a) => (
    <>
      <rect x="48" y="58" width="66" height="74" rx="9" fill={a} />
      <rect x="48" y="58" width="66" height="20" rx="9" fill={INK} opacity="0.25" />
      <text x="81" y="73" textAnchor="middle" fontSize="10" fontWeight="800" fill={INK} letterSpacing="2">OCT</text>
      <text x="81" y="114" textAnchor="middle" fontSize="34" fontWeight="800" fill={INK}>24</text>
      <Line x={128} y={60} w={110} h={9} o={0.6} />
      <Line x={128} y={76} w={78} h={4} />
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} cx={136 + i * 16} cy="98" r="9" fill={a} opacity={0.35 + i * 0.18} stroke={INK} strokeWidth="2" />
      ))}
      <rect x="128" y="116" width="68" height="18" rx="9" fill={a} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x="48" y={146 + i * 15} width="30" height="10" rx="5" fill={a} opacity="0.3" />
          <Line x={88} y={149 + i * 15} w={[110, 90, 120][i]} o={0.35} />
        </g>
      ))}
    </>
  ),

  education: (a) => (
    <>
      <rect x="48" y="58" width="112" height="70" rx="9" fill={a} opacity="0.22" />
      <circle cx="104" cy="93" r="15" fill={a} />
      <path d="M99 86l13 7-13 7z" fill={INK} />
      <rect x="48" y="136" width="112" height="5" rx="2.5" fill={CREAM} opacity="0.12" />
      <rect x="48" y="136" width="66" height="5" rx="2.5" fill={a} />
      <Line x={176} y={60} w={92} h={9} o={0.6} />
      <Line x={176} y={76} w={62} h={4} />
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={i} cx={180 + i * 11} cy="95" r="3.6" fill={a} opacity={i < 4 ? 1 : 0.3} />
      ))}
      <rect x="176" y="108" width="60" height="19" rx="9.5" fill={a} />
      {[0, 1].map((i) => (
        <g key={i}>
          <circle cx="56" cy={158 + i * 16} r="6" fill={a} opacity={i === 0 ? 1 : 0.35} />
          {i === 0 && <path d="M53 158l2.2 2.2L59.5 156" stroke={INK} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
          <Line x={70} y={156 + i * 16} w={[110, 86][i]} o={0.4} />
          <Line x={226} y={156 + i * 16} w={30} h={4} o={0.2} />
        </g>
      ))}
    </>
  ),

  custom: (a) => (
    <>
      <rect x="62" y="56" width="196" height="116" rx="12" fill="none" stroke={a} strokeOpacity="0.45" strokeDasharray="5 6" />
      <circle cx="160" cy="112" r="20" fill={a} />
      <path d="M160 102v20M150 112h20" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <path className="ta-bob" d={star(94, 80, 9)} fill={a} />
      <path className="ta-bob" style={{ animationDelay: '1.2s' }} d={star(232, 90, 7)} fill={a} opacity="0.8" />
      <path className="ta-bob" style={{ animationDelay: '2.2s' }} d={star(214, 150, 10)} fill={a} opacity="0.9" />
      <circle cx="102" cy="146" r="5" fill={a} opacity="0.35" />
      <rect x="76" y="116" width="12" height="12" rx="3" fill={a} opacity="0.25" />
      <Line x={228} y={62} w={20} h={3} o={0.25} />
    </>
  ),
};

export const TYPE_ACCENTS = ACCENTS;

export default function TypeArt({ id }) {
  const accent = ACCENTS[id] || ACCENTS.custom;
  const draw = ART[id] || ART.custom;
  return <Frame accent={accent}>{draw(accent)}</Frame>;
}
