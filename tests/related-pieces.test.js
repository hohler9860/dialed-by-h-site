const test = require('node:test');
const assert = require('node:assert');
const { pickRelated } = require('../lib/related-pieces');

let n = 0;
const piece = (brand, model, ref, dialColor = 'Black', caseMaterial = 'Steel') => ({ slug: `p${++n}`, image: 'x.webp', brand, model, ref, dialColor, caseMaterial });

test('shows other models from the brand plus one variation of this model', () => {
  const w = piece('Rolex', 'Cosmograph Daytona', '126500LN');
  const all = [w, piece('Rolex', 'Cosmograph Daytona', '116500LN', 'White'), piece('Rolex', 'Cosmograph Daytona', '126506', 'Ice Blue', 'Platinum'), piece('Rolex', 'Submariner', '124060'), piece('Rolex', 'Day-Date 40', '228238', 'Green', 'Gold'), piece('Rolex', 'GMT-Master II', '126710BLRO'), piece('Rolex', 'Datejust 41', '126334', 'Blue')];
  const got = pickRelated(w, all);
  assert.strictEqual(got.length, 4);
  assert.strictEqual(got.filter((p) => p.model === 'Cosmograph Daytona').length, 1);
  assert.strictEqual(new Set(got.map((p) => p.model)).size, 4);
});

test('never shows the watch itself, the same reference, or another brand', () => {
  const w = piece('Patek Philippe', 'Nautilus', '5711/1A');
  const all = [w, piece('Patek Philippe', 'Nautilus', '5711/1A'), piece('Rolex', 'Submariner', '124060'), piece('Patek Philippe', 'Calatrava', '5196')];
  assert.deepStrictEqual(pickRelated(w, all).map((p) => p.model), ['Calatrava']);
});

test('treats differently punctuated brand names as one brand', () => {
  const w = piece('F.P.Journe', 'Octa', 'A');
  const got = pickRelated(w, [w, piece('F.P. Journe', 'Élégante 40', 'B')]);
  assert.strictEqual(got.length, 1);
});

test('treats case sizes as one model family', () => {
  const w = piece('Rolex', 'Day-Date 36', 'A', 'Black');
  const other = piece('Rolex', 'Day-Date 40', 'B', 'Black');
  const sub = piece('Rolex', 'Submariner', 'C');
  assert.deepStrictEqual(pickRelated(w, [w, other, sub], 1), [sub]);
});

test('makes the same picks every time for a page', () => {
  const w = piece('Audemars Piguet', 'Royal Oak', 'R');
  const all = [w, ...Array.from({ length: 30 }, (_, i) => piece('Audemars Piguet', `Model ${i}`, `X${i}`))];
  assert.deepStrictEqual(pickRelated(w, all).map((p) => p.slug), pickRelated(w, [...all].reverse()).map((p) => p.slug));
});

test('tops up from what is left when a brand is small, and skips pieces with no image', () => {
  const w = piece('Tudor', 'Black Bay Chrono', 'A');
  const same = piece('Tudor', 'Black Bay Chrono', 'B');
  const noImage = { ...piece('Tudor', 'Pelagos', 'C'), image: '' };
  assert.deepStrictEqual(pickRelated(w, [w, same, noImage]), [same]);
});

test('copes with no catalogue', () => { assert.deepStrictEqual(pickRelated(piece('Rolex', 'Sub', 'A'), []), []); });
