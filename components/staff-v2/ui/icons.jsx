// components/staff-v2/ui/icons.jsx
//
// Lucide-style stroke icons matching the prototype exactly.
// Every icon: stroke=currentColor, paths identical to the design
// bundle (icons.jsx). Importable individually OR as the I bag.

const sw = (n) => ({ strokeWidth: n, strokeLinecap: 'round', strokeLinejoin: 'round' });

const Svg = ({ children, viewBox = '0 0 24 24', ...rest }) => (
  <svg viewBox={viewBox} fill="none" stroke="currentColor" {...rest}>{children}</svg>
);

export const I = {
  back:    <Svg {...sw(2)}><path d="M19 12H5M12 19l-7-7 7-7"/></Svg>,
  close:   <Svg {...sw(2)}><path d="M18 6 6 18M6 6l12 12"/></Svg>,
  plus:    <Svg {...sw(2.2)}><path d="M12 5v14M5 12h14"/></Svg>,
  minus:   <Svg {...sw(2.2)}><path d="M5 12h14"/></Svg>,
  chevR:   <Svg {...sw(2)}><path d="m9 18 6-6-6-6"/></Svg>,
  arrowR:  <Svg {...sw(2.2)}><path d="M5 12h14M13 5l7 7-7 7"/></Svg>,
  user:    <Svg {...sw(1.8)}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></Svg>,
  grid:    <Svg {...sw(1.9)}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></Svg>,
  chef:    <Svg {...sw(1.8)}><path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z"/><path d="M6 17h12"/></Svg>,
  receipt: <Svg {...sw(1.8)}><path d="M4 2v20l2-1.5L8 22l2-1.5L12 22l2-1.5L16 22l2-1.5L20 22V2l-2 1.5L16 2l-2 1.5L12 2l-2 1.5L8 2 6 3.5Z"/><path d="M8 7h8M8 11h8M8 15h5"/></Svg>,
  bell:    <Svg {...sw(1.8)}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></Svg>,
  edit:    <Svg {...sw(1.9)}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></Svg>,
  trash:   <Svg {...sw(1.9)}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></Svg>,
  check:   <Svg {...sw(2.4)}><path d="M20 6 9 17l-5-5"/></Svg>,
  flame:   <Svg {...sw(1.9)}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5Z"/></Svg>,
  send:    <Svg {...sw(2.1)}><path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z"/></Svg>,
  copy:    <Svg {...sw(1.9)}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></Svg>,
  clock:   <Svg {...sw(1.9)}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></Svg>,
  search:  <Svg {...sw(1.9)}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></Svg>,
};
