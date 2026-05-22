// Mock progress photos — replace with API call when backend is ready
// Schema: progress_photos (member_id, url, date, label)

export interface ProgressPhoto {
  id: string;
  memberId: string;
  url: string;          // base64 data-URL or remote URL
  date: string;         // YYYY-MM-DD
  label: string;        // e.g. "Front", "Side", "Back"
}

const today = new Date();
const dayOffset = (n: number) =>
  new Date(today.getTime() - n * 86400000).toISOString().split('T')[0];

// Placeholder mock photos use color-coded SVG data-URLs.
const placeholder = (color: string, label: string) =>
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320">
      <rect width="100%" height="100%" fill="${color}"/>
      <text x="50%" y="50%" font-family="Inter,sans-serif" font-size="20" fill="#fff" text-anchor="middle" dy=".3em">${label}</text>
    </svg>`
  );

export const MOCK_PROGRESS_PHOTOS: ProgressPhoto[] = [
  { id: 'p-001', memberId: 'eya.lorenzana@email.com', url: placeholder('#4c1d95', '60d ago'), date: dayOffset(60), label: 'Front' },
  { id: 'p-002', memberId: 'eya.lorenzana@email.com', url: placeholder('#5b21b6', '45d ago'), date: dayOffset(45), label: 'Front' },
  { id: 'p-003', memberId: 'eya.lorenzana@email.com', url: placeholder('#6d28d9', '30d ago'), date: dayOffset(30), label: 'Front' },
  { id: 'p-004', memberId: 'eya.lorenzana@email.com', url: placeholder('#7c3aed', '15d ago'), date: dayOffset(15), label: 'Front' },
  { id: 'p-005', memberId: 'eya.lorenzana@email.com', url: placeholder('#8b5cf6', 'Today'),   date: dayOffset(0),  label: 'Front' },
];
