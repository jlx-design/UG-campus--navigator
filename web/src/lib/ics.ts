// Download an .ics calendar file (works with Google Calendar, Apple Calendar, Outlook).
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (s: string) => s.replace(/[\;,]/g, m => `\\${m}`).replace(/\n/g, '\\n');
export function icsFile(e: { uid: string; title: string; start: Date; minutes: number; location?: string; description?: string; alarmMin?: number }) {
  const end = new Date(e.start.getTime() + e.minutes * 60000);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Campus Navigator//EN', 'BEGIN:VEVENT', `UID:${e.uid}@ugnav`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(e.start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(e.title)}`, ...(e.location ? [`LOCATION:${esc(e.location)}`] : []), ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []),
    ...(e.alarmMin ? ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, `TRIGGER:-PT${e.alarmMin}M`, 'END:VALARM'] : []), 'END:VEVENT', 'END:VCALENDAR'];
  const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
  const a = document.createElement('a'); a.href = url; a.download = `${e.title.replace(/[^\w-]+/g, '_')}.ics`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
