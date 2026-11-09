const { test } = require('node:test');
const assert = require('node:assert/strict');
const { _sanitizeInline: clean } = require('../api/journal-admin');

test('links to our own pages are followed and open in place', () => {
  assert.equal(clean('<a href="/journal/some-story">story</a>'), '<a href="/journal/some-story">story</a>');
  assert.equal(clean('<a href="https://www.dialedbyhenry.com/buy/">buy</a>'), '<a href="https://www.dialedbyhenry.com/buy/">buy</a>');
  assert.equal(clean('<a href="https://dialedbyhenry.com">home</a>'), '<a href="https://dialedbyhenry.com">home</a>');
  assert.equal(clean('<a href="#prize-list">list</a>'), '<a href="#prize-list">list</a>');
});

test('outside links stay nofollow in a new tab', () => {
  assert.equal(clean('<a href="https://gphg.org/en">GPHG</a>'), '<a href="https://gphg.org/en" rel="noopener nofollow" target="_blank">GPHG</a>');
  assert.equal(clean('<a href="https://dialedbyhenry.com.evil.example/x">x</a>'), '<a href="https://dialedbyhenry.com.evil.example/x" rel="noopener nofollow" target="_blank">x</a>');
  assert.equal(clean('<a href="//evil.example/x">x</a>'), '<a href="//evil.example/x" rel="noopener nofollow" target="_blank">x</a>');
});

test('unsafe links and attributes are still stripped', () => {
  assert.equal(clean('<a href="javascript:alert(1)">x</a>'), '<a>x</a>');
  assert.equal(clean('<a href="/journal/a" onclick="steal()">x</a>'), '<a href="/journal/a">x</a>');
  assert.equal(clean('<script>alert(1)</script>ok'), 'ok');
});
