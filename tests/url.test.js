import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUrl, validateUrl, getDomain, getSourceDomain } from '../src/utils/url.js';

test('normalizes hostname, default ports, fragment and trailing slash', () => {
  assert.equal(normalizeUrl('HTTPS://Example.COM:443/article/#comments'), 'https://example.com/article');
  assert.equal(normalizeUrl('http://EXAMPLE.com:80/article/'), 'http://example.com/article');
});
test('the three article variants are equivalent', () => {
  const variants = ['https://example.com/article', 'https://example.com/article/', 'https://example.com/article#comments'];
  assert.equal(new Set(variants.map(normalizeUrl)).size, 1);
});
test('preserves query parameters and query ordering', () => {
  assert.notEqual(normalizeUrl('https://example.com/article?id=1'), normalizeUrl('https://example.com/article?id=2'));
  assert.equal(normalizeUrl('https://example.com/article/?utm_source=mail&id=2#x'), 'https://example.com/article?utm_source=mail&id=2');
});
test('preserves root URL and non-default ports', () => {
  assert.equal(normalizeUrl('https://example.com'), 'https://example.com/');
  assert.equal(normalizeUrl('https://example.com:8443/'), 'https://example.com:8443/');
});
test('validates HTTP and HTTPS, including surrounding whitespace', () => {
  assert.equal(validateUrl('  http://example.com/a  ').href, 'http://example.com/a');
  assert.equal(getDomain('https://EXAMPLE.com/a'), 'example.com');
});
test('rejects invalid URLs, relative URLs, unsafe schemes and credentials', () => {
  for (const value of [null, '', 'example.com', '/article', 'https://', 'javascript:alert(1)', 'file:///tmp/a', 'data:text/plain,hi', 'ftp://example.com', 'https://user:pass@example.com']) {
    assert.throws(() => normalizeUrl(value));
  }
});
test('optional source domain tolerates missing and malformed metadata', () => {
  assert.equal(getSourceDomain(null), null);
  assert.equal(getSourceDomain('invalid'), null);
  assert.equal(getSourceDomain('https://reddit.com/r/example'), 'reddit.com');
});
