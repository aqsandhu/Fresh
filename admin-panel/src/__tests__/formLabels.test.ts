// Accessibility guard: every <label> in the admin panel must be tied to a form
// control — by htmlFor, or by wrapping the control. A label that is linked to
// nothing is invisible to screen readers and does nothing when clicked.
// (In November 2026 only 3 of ~130 labels were linked; this keeps it at all.)
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..');

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      if (name !== '__tests__' && name !== 'testDoubles') tsxFiles(full, out);
    } else if (full.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

/** Labels with no htmlFor that do not wrap an input / select / textarea. */
export function unlinkedLabels(source: string): number[] {
  const lines = source.split(/\r?\n/);
  const found: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const at = lines[i].indexOf('<label');
    if (at === -1 || !/<label[\s>]/.test(lines[i])) continue;
    // opening tag (may span lines)
    let end = i;
    let tag = lines[i].slice(at);
    while (!/>/.test(tag.replace(/=>/g, '')) && end < i + 10 && end < lines.length - 1) {
      end++;
      tag += '\n' + lines[end];
    }
    if (/htmlFor=/.test(tag)) continue;
    // body up to </label>
    let close = i;
    let body = lines[i].slice(at);
    while (!/<\/label>/.test(body) && close < i + 60 && close < lines.length - 1) {
      close++;
      body += '\n' + lines[close];
    }
    if (/<(input|select|textarea)\b/.test(body)) continue; // wraps its control
    found.push(i + 1);
  }
  return found;
}

describe('admin panel form labels', () => {
  it('finds an unlinked label when there is one (the check itself works)', () => {
    expect(unlinkedLabels('<div>\n  <label className="x">Name</label>\n  <input />\n</div>')).toEqual([2]);
    expect(unlinkedLabels('<label htmlFor="a">Name</label>\n<input id="a" />')).toEqual([]);
    expect(unlinkedLabels('<label className="row">\n  <input type="checkbox" /> Active\n</label>')).toEqual([]);
    expect(unlinkedLabels('<label\n  htmlFor={id}\n  className="x"\n>\n  Name\n</label>')).toEqual([]);
  });

  it('every label is linked to a control', () => {
    const problems: string[] = [];
    for (const file of tsxFiles(SRC)) {
      for (const line of unlinkedLabels(fs.readFileSync(file, 'utf8'))) {
        problems.push(`${path.relative(SRC, file)}:${line}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
