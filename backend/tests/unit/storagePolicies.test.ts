// The uploads bucket is public: files are served by their (random) public URL
// and need no SELECT policy. A SELECT policy for `public` only adds LISTING —
// anyone with the project's anon key could list and download every door
// photo, complaint picture, delivery proof and purchase bill. Writes stay
// service_role only.
import { storagePolicySql } from '../../src/config/storage';

const all = storagePolicySql('uploads').map((p) => p.sql).join('\n');

it('creates no SELECT (listing) policy and drops the old public one', () => {
  expect(all).not.toMatch(/FOR SELECT/i);
  expect(all).toMatch(/DROP POLICY IF EXISTS freshbazar_uploads_public_read/);
});

it('insert / update / delete are for service_role only', () => {
  for (const op of ['INSERT', 'UPDATE', 'DELETE']) {
    expect(all).toMatch(new RegExp(`FOR ${op} TO service_role`));
  }
  expect(all).not.toMatch(/TO (public|anon|authenticated)\b/);
});
