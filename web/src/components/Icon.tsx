import React from 'react';

// Stroke icon set (24×24, 1.8px), drawn for this app.
const P: Record<string, string> = {
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14',
  navigate: 'M12 2 4.5 20.3l.7.7L12 18l6.8 3 .7-.7L12 2Z',
  hub: 'M3 10.5 12 4l9 6.5M5 9.5V20h14V9.5M9.5 20v-6h5v6',
  bell: 'M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Zm4 10.5a2 2 0 0 0 4 0',
  user: 'M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm-8 9a8 8 0 0 1 16 0',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 3-4-4',
  close: 'M6 6l12 12M18 6 6 18',
  locate: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v3m0 14v3M2 12h3m14 0h3',
  campus: 'M4 20V10l8-5 8 5v10M9 20v-5h6v5',
  layers: 'm12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',
  chat: 'M4 5h16v11H8l-4 4V5Zm4 5h8M8 13h5',
  sparkle: 'M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5m7 7L18 18M6 18l2.5-2.5m7-7L18 6',
  star: 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z',
  starFill: 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z',
  walk: 'M13 4.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM9 22l2-6 2.5 2v4m-1-9.5L14 9l3 3h3M11 8l-3 1.5V13m3.5-4.5L10 14',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-11v6m0-9.5v.5',
  alert: 'M12 3 2 20h20L12 3Zm0 6v5m0 3v.5',
  shield: 'M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Zm-3.5 9 2.5 2.5 4.5-4.5',
  external: 'M14 4h6v6m0-6-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  arrowLeft: 'M19 12H5m6-7-7 7 7 7',
  chevron: 'm9 6 6 6-6 6',
  send: 'M4 12 20 4l-6 16-2.5-6.5L4 12Z',
  flag: 'M5 21V4m0 0h11l-2 4 2 4H5',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.3 7.3 0 0 0-2.2-1.3L14.4 3h-4l-.4 2.4a7.3 7.3 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a7.3 7.3 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a7.3 7.3 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3Z',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4m-4-4h10',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13',
  edit: 'M4 20h4L19 9l-4-4L4 16v4Z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-14v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Zm0 14a2 2 0 0 1 2-2h13',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  refresh: 'M20 11a8 8 0 0 0-14.9-3M4 4v4h4m-4 5a8 8 0 0 0 14.9 3M20 20v-4h-4',
  bus: 'M6 17V6a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v11H6Zm0-5h12M8 20v-3m8 3v-3M9 14.5h.01M15 14.5h.01',
  sos: 'M12 3 3 7v5c0 5 3.8 8.7 9 9.5 5.2-.8 9-4.5 9-9.5V7l-9-4Zm0 6v4m0 3v.5',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  calendar: 'M4 6h16v14H4V6Zm0 4h16M8 3v4m8-4v4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2',
  palette: 'M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-1.3-1.2-1.7-1.2-2.7 0-.9.7-1.5 1.7-1.5H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8Zm-5 9h.01M9 7.5h.01M15 7.5h.01',
  cube: 'm12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 9 8-4.5M12 12v9m0-9L4 7.5',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3.5-12.5-2 5-5 2 2-5 5-2Z',
  grid: 'M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z',
  satellite: 'M7 7l4 4m-6.5-1.5 3-3 6 6-3 3-6-6Zm9.5.5 3-3m-1 6a4 4 0 0 0-4-4m7 4a7 7 0 0 0-7-7',
  steering: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm-9-2h7m4 0h7m-9 2v7',
  // Categories
  school: 'M2 9.5 12 4l10 5.5-10 5.5L2 9.5Zm4 2.3V17c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.2',
  lecture: 'M3 4h18v11H3V4Zm9 11v5m-4 0h8M7 8h6',
  library: 'M5 4v16M9 4v16M13.5 4.5l4.5 15.5M3 20h18',
  admin: 'M4 21V7l8-4 8 4v14M8 10h2m4 0h2M8 14h2m4 0h2M10 21v-3h4v3',
  hall: 'M3 21V9l9-6 9 6v12M7 21v-7h10v7M7 11h.01M17 11h.01',
  services: 'M12 21s-8-4.6-8-11a5 5 0 0 1 8-4 5 5 0 0 1 8 4c0 6.4-8 11-8 11Z',
  health: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v8m-4-4h8',
  sports: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3.5 9.5c5 1 12 1 17 0M3.5 14.5c5-1 12-1 17 0M12 3c-3 5-3 13 0 18m0-18c3 5 3 13 0 18',
  food: 'M7 3v8a2 2 0 0 0 2 2v8M7 3v5m4-5v5a2 2 0 0 1-2 2m8-7c-2 0-3 2-3 5s1 4 3 4v9',
  worship: 'M12 2v4m-2-2h4M6 22V12l6-4 6 4v10M10 22v-5h4v5',
  bank: 'M3 10 12 4l9 6M5 10v8m4.5-8v8m5-8v8M19 10v8M3 21h18',
  transport: 'M6 17V6a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v11M6 12h12M8 20v-3m8 3v-3M9 15h.01M15 15h.01',
  pin: 'M12 21s7-6.3 7-12a7 7 0 0 0-14 0c0 5.7 7 12 7 12Zm0-9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  // Maneuvers (OpenRouteService step types)
  turnLeft: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 6 6v5',
  turnRight: 'm15 14 5-5-5-5m5 5H10a6 6 0 0 0-6 6v5',
  straight: 'M12 20V4m-6 6 6-6 6 6',
  uturn: 'M8 20V9a5 5 0 0 1 10 0v4m-4-3 4 4 4-4',
  slightLeft: 'M7 9V4h5M7 4l7 7a4 4 0 0 1 1 2.6V21',
  slightRight: 'M17 9V4h-5m5 0-7 7a4 4 0 0 0-1 2.6V21',
  volume: 'M4 9v6h4l5 4V5L8 9H4Zm12.5-.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  volumeOff: 'M4 9v6h4l5 4V5L8 9H4Zm12 1 5 5m0-5-5 5',
  calc: 'M6 3h12v18H6V3Zm2.5 3h7v3h-7V6Zm0 6.5h.01m3.5 0h.01m3.5 0h.01M8.5 16h.01m3.5 0h.01m3.5 0h.01',
  idcard: 'M3 6h18v12H3V6Zm5 3.5a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5ZM5.5 16a2.5 2.5 0 0 1 5 0M13 10h5m-5 3h4',
  door: 'M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M3 21h18m-7-9h.01',
  shop: 'M4 9h16l-1-5H5L4 9Zm0 0v11h16V9M9 20v-6h6v6M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0',
  event: 'M4 5h16v15H4V5Zm0 5h16M8 3v4m8-4v4m-6 7 1.5 1.5L15 12',
  share2: 'M16 6l-4-4-4 4m4-4v13M5 11v9h14v-9',
  offline: 'M12 3v12m-5-5 5 5 5-5M5 21h14',
  bellRing: 'M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Zm4 10.5a2 2 0 0 0 4 0M3 6.5A9 9 0 0 1 5.5 3M21 6.5A9 9 0 0 0 18.5 3',
  chart: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  download: 'M12 3v12m-5-5 5 5 5-5M4 21h16',
  share: 'M12 3v12M8 7l4-4 4 4M5 12v8h14v-8',
  plusSquare: 'M4 4h16v16H4V4Zm8 4v8m-4-4h8',
  recenter: 'M12 2 4.5 20.3l.7.7L12 18l6.8 3 .7-.7L12 2Z',
  arrive: 'M12 21s7-6.3 7-12a7 7 0 0 0-14 0c0 5.7 7 12 7 12Zm-3-12 2 2 4-4',
};


// Two-tone topic icons for the Campus Guide: an outline plus a soft tinted fill (24×24, 1.5px).
const D: Record<string, { s: string; f: string; evenodd?: boolean }> = {
  // Bottom bar (two-tone: the gold fill shows on the selected tab)
  tMap: { s: 'M9 4 3.5 6.3v13.4L9 17.4l6 2.3 5.5-2.3V4L15 6.3 9 4ZM9 4v13.4M15 6.3v13.4', f: 'M9 4v13.4l6 2.3V6.3L9 4Z' },
  tSchedule: { s: 'M6.5 5h11A2.5 2.5 0 0 1 20 7.5v10.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18V7.5A2.5 2.5 0 0 1 6.5 5ZM4 9.5h16M8.5 3v4M15.5 3v4M8.5 13.5h.01M12 13.5h.01M15.5 13.5h.01M8.5 17h.01M12 17h.01', f: 'M4 9.5h16v-2A2.5 2.5 0 0 0 17.5 5h-11A2.5 2.5 0 0 0 4 7.5v2Z' },
  tGuide: { s: 'M12 6.6C10 5.1 7.4 4.6 3.5 4.6v13.6c3.9 0 6.5.5 8.5 2 2-1.5 4.6-2 8.5-2V4.6c-3.9 0-6.5.5-8.5 2ZM12 6.6v13.6', f: 'M12 6.6c2-1.5 4.6-2 8.5-2v13.6c-3.9 0-6.5.5-8.5 2V6.6Z' },
  tUpdates: { s: 'M6.5 10a5.5 5.5 0 1 1 11 0c0 5 2 6.6 2 6.6h-15s2-1.6 2-6.6ZM10 19.6a2 2 0 0 0 4 0', f: 'M6.5 10a5.5 5.5 0 1 1 11 0c0 5 2 6.6 2 6.6h-15s2-1.6 2-6.6Z' },
  tMe: { s: 'M12 12.1a3.9 3.9 0 1 0 0-7.8 3.9 3.9 0 0 0 0 7.8ZM4.6 20.4c.8-3.6 3.8-5.6 7.4-5.6s6.6 2 7.4 5.6', f: 'M12 12.1a3.9 3.9 0 1 0 0-7.8 3.9 3.9 0 0 0 0 7.8Z' },
  // Campus AI: a speech bubble with a small star
  askAi: { s: 'M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H11l-5 4v-4h-.5A1.5 1.5 0 0 1 4 14.5v-9Z', f: 'M12 6.4l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1 1-2.6Z' },
  // Map side buttons
  cLayers: { s: 'm12 4 8.5 4.5L12 13 3.5 8.5 12 4ZM3.5 12.5l8.5 4.5 8.5-4.5M3.5 16l8.5 4.5 8.5-4.5', f: 'm12 4 8.5 4.5L12 13 3.5 8.5 12 4Z' },
  cLocate: { s: 'M20 4 4.5 10.6l6.6 2.3 2.3 6.6L20 4Z', f: 'M20 4 4.5 10.6l6.6 2.3 2.3 6.6L20 4Z' },
  cCampus: { s: 'M3 9.5 12 4l9 5.5H3Zm1.5 0V18m5-8.5V18m5-8.5V18m5-8.5V18M3 21h18M3.5 18h17', f: 'M3 9.5 12 4l9 5.5H3Z' },
  cNorth: { s: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 6.5l3 8-3-1.6-3 1.6 3-8Z', f: 'M12 6.5l3 8-3-1.6-3 1.6 3-8Z' },
  gFirstSteps: {
    s: 'M4.1 11.2a2.9 4.6 0 1 0 5.8 0a2.9 4.6 0 1 0 -5.8 0ZM5.5 19.4a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0 -3.8 0ZM13.9 5.6a2.9 4.6 0 1 0 5.8 0a2.9 4.6 0 1 0 -5.8 0ZM15.299999999999999 13.8a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0 -3.8 0Z',
    f: 'M4.1 11.2a2.9 4.6 0 1 0 5.8 0a2.9 4.6 0 1 0 -5.8 0ZM13.9 5.6a2.9 4.6 0 1 0 5.8 0a2.9 4.6 0 1 0 -5.8 0Z' },
  gRegister: {
    s: 'M9 4.5H7a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V5.5a1 1 0 0 0-1-1h-2M9 3h6v3H9V3Zm0 10.5 2 2 4-4.5',
    f: 'M6 5.5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5.5Z' },
  gOrient: {
    s: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-15.5V6m0 12v.5M5.5 12H6m12 0h.5M15.2 8.8l-1.8 4.6-4.6 1.8 1.8-4.6 4.6-1.8Z',
    f: 'M15.2 8.8l-1.8 4.6-4.6 1.8 1.8-4.6 4.6-1.8Z' },
  gAcademic: {
    s: 'M2.5 9 12 5l9.5 4-9.5 4-9.5-4Zm4 2.2v4.3c0 1.4 2.5 2.8 5.5 2.8s5.5-1.4 5.5-2.8v-4.3M21.5 9v5',
    f: 'M2.5 9 12 5l9.5 4-9.5 4-9.5-4Z' },
  gEssentials: {
    s: 'M3 9.5 12 4l9 5.5H3Zm1.5 0V18m5-8.5V18m5-8.5V18m5-8.5V18M3 21h18M3.5 18h17',
    f: 'M3 9.5 12 4l9 5.5H3Z' },
  gServices: {
    s: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5.6 5.6l3.6 3.6m5.6 5.6 3.6 3.6m0-12.8-3.6 3.6m-5.6 5.6-3.6 3.6',
    f: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', evenodd: true },
  gHalls: {
    s: 'M3 19.5V6m0 9h18v4.5M21 15v-3a3 3 0 0 0-3-3h-7v6M6.8 12.6a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z',
    f: 'M11 9h7a3 3 0 0 1 3 3v3H11V9Z' },
  gAround: {
    s: 'M12 3v18M8.5 21h7M5 5h11l2.5 2.5L16 10H5V5Zm14 7H8l-2.5 2.5L8 17h11v-5Z',
    f: 'M5 5h11l2.5 2.5L16 10H5V5Zm14 7H8l-2.5 2.5L8 17h11v-5Z' },
  gFaq: {
    s: 'M4 5h16v11h-9l-5 4v-4H4V5Zm6.2 3.6a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.1v.4M12 13.8h.01',
    f: 'M4 5h16v11h-9l-5 4v-4H4V5Z' },
  gTerms: {
    s: 'M5 18V5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v11H7a2 2 0 0 0-2 2Zm0 0a2 2 0 0 0 2 2h12v-4M9.3 13l2.7-6.5 2.7 6.5m-4.5-2h3.6',
    f: 'M5 18V5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v11H7a2 2 0 0 0-2 2Z' },
  gOfficial: {
    s: 'M12 14.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11Zm-3.2-.9L8 21l4-2 4 2-.8-7.4M9.8 9l1.5 1.5 3-3',
    f: 'M12 14.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11Z' },
};

export function Icon({ name, title, ...rest }: { name: string; title?: string } & React.SVGProps<SVGSVGElement>) {
  const duo = D[name];
  if (duo) return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={title ? undefined : true} role={title ? 'img' : undefined} {...rest}>
      {title ? <title>{title}</title> : null}
      <path className="duo-fill" d={duo.f} stroke="none" fillRule={duo.evenodd ? 'evenodd' : undefined} />
      <path d={duo.s} />
    </svg>
  );
  const d = P[name] || P.pin;
  const filled = name === 'starFill';
  return (
    <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined} {...rest}>
      {title ? <title>{title}</title> : null}
      <path d={d} />
    </svg>
  );
}

export const iconSvgString = (name: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[name] || P.pin}"/></svg>`;

/** ORS step type → icon. https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/instruction-types */
export function maneuverIcon(type: number): string {
  switch (type) {
    case 0: case 2: return 'turnLeft';
    case 1: case 3: return 'turnRight';
    case 4: case 12: return 'slightLeft';
    case 5: case 13: return 'slightRight';
    case 9: return 'uturn';
    case 10: return 'arrive';
    default: return 'straight';
  }
}
