// Journeys run in order (workers: 1): the order placed in journey 1 is the one
// the office fulfils in journey 2. Passed through a small file.
import fs from 'fs';
import path from 'path';

// Outside test-results/ (Playwright empties that folder at the start of a run).
const FILE = path.join(__dirname, '..', '.journey.json');

export function saveJourney(data: Record<string, string>): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const prev = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
  fs.writeFileSync(FILE, JSON.stringify({ ...prev, ...data }, null, 2));
}

export function readJourney(): Record<string, string> {
  return fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
}
