import fs from 'node:fs';
import assert from 'node:assert/strict';
// Unit tests cannot prove that Next.js actually discovers the proxy entry point.
const manifest=JSON.parse(fs.readFileSync('.next/server/functions-config-manifest.json','utf8'));
const proxy=manifest.functions?.['/_middleware'];
assert.ok(proxy?.runtime==='nodejs'&&proxy.matchers?.length,
  'Next.js did not register the authentication/setup proxy in the production build');
for(const route of ['/dashboard','/dashboard/admin','/invite/test','/api/boards']) {
  assert.ok(proxy.matchers.some(m=>new RegExp(m.regexp).test(route)),`Proxy does not match ${route}`);
}
console.log('PASS: production build registers the authentication/setup proxy');
