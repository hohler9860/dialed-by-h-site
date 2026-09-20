-- 2026-09-20: reference -> brand/model rules. The classifier keeps the reference
-- right and the model name wrong (60% of "Daytona" rows are Datejusts, GMTs,
-- Sky-Dwellers...). References are deterministic, so force brand/model from
-- them. The existing trigger listings_ref_rules applies these on write; the
-- UPDATE at the bottom backfills what is already stored.
-- Run in the Supabase SQL editor for the DBH project (untnrofsnmoyxdidxbdj).

insert into wholesale.ref_rules (pattern, brand, model, note) values
-- Rolex, 6-digit (optional M prefix, optional -0001 suffix handled by ^ anchor only)
('^M?1165[0-9]{2}',        'Rolex', 'Daytona',        '116500-116529'),
('^M?1265[0-9]{2}',        'Rolex', 'Daytona',        '126500-126529'),
('^M?1162[0-9]{2}',        'Rolex', 'Datejust',       'DJ36 116200/116233/116234'),
('^M?1163[0-9]{2}',        'Rolex', 'Datejust',       'DJ41 116300/116333/116334'),
('^M?1262[0-9]{2}',        'Rolex', 'Datejust',       'DJ36 126200/126233/126234'),
('^M?1263[0-9]{2}',        'Rolex', 'Datejust',       'DJ41 126300/126331/126333/126334'),
('^M?1782[0-9]{2}',        'Rolex', 'Datejust',       'DJ31 178240/178271/178274'),
('^M?2782[0-9]{2}',        'Rolex', 'Datejust',       'DJ31 278271/278273/278274/278275/278278'),
('^M?2792[0-9]{2}',        'Rolex', 'Datejust',       'DJ28 279171/279174'),
('^M?2791[0-9]{2}',        'Rolex', 'Datejust',       'DJ28 279160/279171'),
('^M?1182[0-9]{2}',        'Rolex', 'Day-Date',       'DD36 118205/118235/118238/118239'),
('^M?1183[0-9]{2}',        'Rolex', 'Day-Date',       'DD36 118346/118388'),
('^M?1282[0-9]{2}',        'Rolex', 'Day-Date',       'DD36 128235/128238/128239'),
('^M?1283[0-9]{2}',        'Rolex', 'Day-Date',       'DD36 128345/128348'),
('^M?2182[0-9]{2}',        'Rolex', 'Day-Date',       'DD41 218235/218238'),
('^M?2282[0-9]{2}',        'Rolex', 'Day-Date',       'DD40 228235/228238/228239'),
('^M?2283[0-9]{2}',        'Rolex', 'Day-Date',       'DD40 228345/228348'),
('^M?1167[0-9]{2}',        'Rolex', 'GMT-Master II',  '116710/116713/116718/116719'),
('^M?1267[0-9]{2}',        'Rolex', 'GMT-Master II',  '126710/126711/126713/126715/126718/126720'),
('^M?1166[01][0-9]',       'Rolex', 'Submariner',     '116610/116613/116618/116619'),
('^M?1266[1][0-9]',        'Rolex', 'Submariner',     '126610/126613/126618/126619'),
('^M?1140[0-9]{2}',        'Rolex', 'Submariner',     '114060 no-date'),
('^M?1240[0-9]{2}',        'Rolex', 'Submariner',     '124060 no-date'),
('^M?1266[0][0-9]',        'Rolex', 'Sea-Dweller',    '126600/126603'),
('^M?1166[0][0-9]',        'Rolex', 'Sea-Dweller',    '116600'),
('^M?1266[6][0-9]',        'Rolex', 'Deepsea',        '126660'),
('^M?1366[0-9]{2}',        'Rolex', 'Deepsea',        '136660/136668'),
('^M?1166[6][0-9]',        'Rolex', 'Deepsea',        '116660'),
('^M?1266[25][0-9]',       'Rolex', 'Yacht-Master',   '126621/126622/126655'),
('^M?1166[25][0-9]',       'Rolex', 'Yacht-Master',   '116621/116622/116655'),
('^M?2266[0-9]{2}',        'Rolex', 'Yacht-Master',   '226658/226659/226679 42mm'),
('^M?2686[0-9]{2}',        'Rolex', 'Yacht-Master',   '268621/268622/268655 37mm'),
('^M?1686[0-9]{2}',        'Rolex', 'Yacht-Master',   '168622/168623 older'),
('^M?2265[0-9]{2}',        'Rolex', 'Explorer II',    '226570'),
('^M?2165[0-9]{2}',        'Rolex', 'Explorer II',    '216570'),
('^M?1245[0-9]{2}',        'Rolex', 'Explorer',       '124270/124273'),
('^M?2242[0-9]{2}',        'Rolex', 'Explorer',       '224270'),
('^M?2142[0-9]{2}',        'Rolex', 'Explorer',       '214270'),
('^M?3[23]69[0-9]{2}',     'Rolex', 'Sky-Dweller',    '326933/326934/326938/336933/336934/336935/336938'),
('^M?3[23]62[0-9]{2}',     'Rolex', 'Sky-Dweller',    '326238/336238'),
('^M?1269[0-9]{2}',        'Rolex', 'Air-King',       '126900'),
('^M?1169[0-9]{2}',        'Rolex', 'Air-King',       '116900'),
('^M?1164[0-9]{2}',        'Rolex', 'Milgauss',       '116400'),
('^M?12[46][023]00',       'Rolex', 'Oyster Perpetual','124200/124300/126000'),
('^M?11[46][023]00',       'Rolex', 'Oyster Perpetual','114200/114300/116000'),
('^M?27[67]200',           'Rolex', 'Oyster Perpetual','276200/277200'),
-- Rolex, 5-digit
('^M?165[23][0-9]',        'Rolex', 'Daytona',        '16520/16523/16528'),
('^M?162[0-9]{2}',         'Rolex', 'Datejust',       '16200/16233/16234'),
('^M?18[023][0-9]{2}',     'Rolex', 'Day-Date',       '18038/18238/18239/18338'),
('^M?167[01][0-9]',        'Rolex', 'GMT-Master II',  '16700/16710/16713/16718'),
('^M?1675',                'Rolex', 'GMT-Master',     '1675'),
('^M?166[01][0-9]',        'Rolex', 'Submariner',     '16610/16613/16618/16619'),
('^M?1400[0-9]',           'Rolex', 'Submariner',     '14060 no-date'),
('^M?1660[0-9]',           'Rolex', 'Sea-Dweller',    '16600'),
('^M?1666[0-9]',           'Rolex', 'Sea-Dweller',    '16660'),
('^M?166[2][0-9]',         'Rolex', 'Yacht-Master',   '16622/16623/16628'),
('^M?165[57]0',            'Rolex', 'Explorer II',    '16550/16570'),
('^M?1427[0-9]',           'Rolex', 'Explorer',       '14270'),
-- Patek Philippe (4-digit family + slash)
('^(5711|5712|5726|5980|5990|5811|7118|7010|7021)(/|$|[A-Z])', 'Patek Philippe', 'Nautilus', ''),
('^(5164|5167|5168|5261|5268|5269|5065|5066|5167)(/|$|[A-Z])', 'Patek Philippe', 'Aquanaut', ''),
('^(7128|5821)(/|$|[A-Z])',                                    'Patek Philippe', 'Cubitus',  'released 2024'),
-- Audemars Piguet Royal Oak (15xxx / 77xxx / 67xxx + 2-letter metal code)
('^(15|77|67)[0-9]{3}[A-Z]{2}', 'Audemars Piguet', 'Royal Oak', '15202ST/15500ST/77350ST etc'),
('^26[0-9]{3}(ST|OR|SO|IO|TI|CR|BC|IP|SR|NB)', 'Audemars Piguet', 'Royal Oak Offshore / Chrono', '26xxx is ambiguous between RO chrono and Offshore; review')
on conflict do nothing;

-- Backfill: force brand/model on stored rows whose reference matches a rule.
-- Skips rows Henry corrected by hand. Most specific (longest) pattern wins.
update wholesale.listings l
set brand = r.brand, model = r.model
from lateral (
  select brand, model from wholesale.ref_rules
  where l.reference ~ pattern
  order by length(pattern) desc limit 1
) r
where l.reference is not null
  and (l.brand is distinct from r.brand or l.model is distinct from r.model)
  and coalesce(l.corrected_fields::text, '') !~ '(brand|model)';

-- Sanity check afterwards:
-- select reference, brand, model, count(*) from wholesale.listings
-- where reference ~ '^M?12(62|63|65|67)' group by 1,2,3 order by 1,4 desc;
