-- Local development data. Runs on `supabase db reset`, never on hosted projects.

-- Local only: the mock card gateway (follows the BML Connect flow without
-- moving money) and a sample Tikkit bank account for transfers.
update private.settings set
  card_provider = 'mock',
  bank_name = 'Bank of Maldives',
  bank_account_name = 'Tikkit Pvt Ltd (sample)',
  bank_account_number = '7730000123456';

-- Maldives wall-clock time `days` from today, so the catalog always looks upcoming.
create function pg_temp.mv(days int, h int, m int default 0) returns timestamptz language sql as $$
  select ((date_trunc('day', now() at time zone 'Indian/Maldives') + make_interval(days => days, hours => h, mins => m))
    at time zone 'Indian/Maldives')
$$;
-- Days until the coming Friday (0 on Friday): the Maldivian weekend is Friday and Saturday.
create function pg_temp.fri() returns int language sql as $$
  select ((5 - extract(dow from now() at time zone 'Indian/Maldives')::int + 7) % 7)
$$;

insert into public.events (id, status, notice, title, category, starts_at, ends_at, venue_name, venue_area, venue_address, lat, lng, access, image_url, organizer_name, description, lineup) values
('boduberu-artificial-beach', 'scheduled', null, 'Bodu Beru Night on the Beach', 'Culture',
  pg_temp.mv(0, 20, 30), pg_temp.mv(0, 22, 30), 'Artificial Beach', 'Malé', 'Boduthakurufaanu Magu, Malé', 4.1752, 73.5157,
  'A short walk from the Malé ferry terminal.', null, 'Rhythm of the Atolls',
  'Three bodu beru groups from Malé, Kulhudhuffushi and Addu take turns on the big drums until the circle starts dancing. Free and open to everyone, families welcome.',
  array['Dhoni Beat', 'Kulhudhuffushi Drummers', 'Addu Raalhu']),
('hulhumale-night-market', 'scheduled', null, 'Hulhumalé Night Market', 'Food',
  pg_temp.mv(pg_temp.fri(), 19), pg_temp.mv(pg_temp.fri(), 24), 'Central Park', 'Hulhumalé', 'Nirolhu Magu, Hulhumalé Phase 1', 4.2124, 73.5401,
  'Bus from Malé or a 15 minute drive over Sinamalé Bridge.', null, 'Hulhumalé Traders',
  'Thirty stalls of hedhikaa, mas roshi, grilled reef fish, kulhi boakiba and fresh juices. Live music on the small stage from 8pm. Entry is free, buy food from the stalls.',
  '{}'),
('sunset-dolphin-cruise', 'scheduled', null, 'Sunset Dolphin Cruise', 'Water',
  pg_temp.mv(pg_temp.fri() + 1, 17), pg_temp.mv(pg_temp.fri() + 1, 19), 'Jetty 5', 'Malé', 'North Harbour, Malé', 4.1787, 73.5094,
  'Boarding at Jetty 5, North Harbour. Arrive 15 minutes early.', null, 'Blue Dhoni Trips',
  'Two hours on a traditional dhoni along the reef edge where spinner dolphins feed at dusk. Soft drinks and short eats on board. Sightings are likely but not guaranteed.',
  '{}'),
('thulusdhoo-surf-day', 'scheduled', null, 'Learn to Surf at Thulusdhoo', 'Water',
  pg_temp.mv(pg_temp.fri() + 1, 7, 30), pg_temp.mv(pg_temp.fri() + 1, 13, 30), 'Cokes Beach', 'Thulusdhoo', 'Thulusdhoo, Kaafu Atoll', 4.3747, 73.6517,
  'Public ferry from Malé (about 90 min) or speedboat (30 min). Boat transfer included.', null, 'Kaafu Surf School',
  'A full morning with qualified instructors on the gentler inside section. Board, rash vest, lunch and the speedboat from Malé are included. Ages 12 and up.',
  '{}'),
('futsal-final', 'scheduled', null, 'Inter-Island Futsal Final', 'Sport',
  pg_temp.mv(2, 20), pg_temp.mv(2, 22), 'Futsal Ground', 'Villimalé', 'Villimalé, Malé City', 4.1736, 73.4853,
  'Ferry from Malé every 10 minutes, 5 minute crossing.', null, 'Island Futsal League',
  'Villimalé hosts the final of the season. Last year went to penalties. Seating is first come, first served.',
  '{}'),
('acoustic-hulhumale', 'scheduled', null, 'Unplugged: Acoustic Sessions', 'Music',
  pg_temp.mv(3, 21), pg_temp.mv(3, 23), 'The Reef Café', 'Hulhumalé', 'Beach front, Hulhumalé Phase 1', 4.2185, 73.5446,
  'On the Hulhumalé beach front, opposite the mosque.', null, 'Unplugged MV',
  'Four local singer-songwriters, two guitars and the sea behind them. Covers, new songs and a few old Dhivehi favourites. Ticket includes one drink.',
  array['Aishath Nadha', 'Ibrahim Zaid', 'Mira & the Tides', 'Hassan Rafeeu']),
('manta-snorkel-baa', 'scheduled', null, 'Manta Snorkel Trip, Hanifaru Bay', 'Water',
  pg_temp.mv(5, 6, 30), pg_temp.mv(5, 16, 30), 'Hanifaru Bay', 'Baa Atoll', 'UNESCO Biosphere Reserve, Baa Atoll', 5.1707, 73.1415,
  'Seaplane or domestic flight to Dharavandhoo, then a 15 minute boat. Flights not included.', null, 'Baa Ranger Trips',
  'Snorkel with feeding mantas during the season with licensed rangers. Groups are capped by reserve rules. Includes boat, guide, gear and the reserve fee.',
  '{}'),
('mv-art-space', 'scheduled', null, 'Islands in Ink: New Maldivian Illustration', 'Art',
  pg_temp.mv(1, 10), pg_temp.mv(1, 19), 'Malé Art Space', 'Malé', 'Chandhanee Magu, Malé', 4.1745, 73.5091,
  'Central Malé, five minutes from the Jumhooree Maidhaan.', null, 'Malé Art Space',
  'Work by fourteen young illustrators from across the atolls, from reef studies to comics about island life. Most prints are for sale.',
  '{}'),
('fuvahmulah-shark-dive', 'rescheduled', 'Moved two days later because of strong winds. Existing bookings are valid for the new date.', 'Fuvahmulah Tiger Shark Dive', 'Water',
  pg_temp.mv(8, 7), pg_temp.mv(8, 12), 'Tiger Harbour', 'Fuvahmulah', 'Fuvahmulah City', -0.2986, 73.4246,
  'Domestic flight from Malé (about 1 hour 15 min). Flights not included.', null, 'Deep South Divers',
  'Two guided dives with tiger sharks and thresher sharks. Advanced Open Water and 30 logged dives required. Equipment hire available.',
  '{}'),
('hedhikaa-evening', 'scheduled', null, 'Hedhikaa Tasting Evening', 'Food',
  pg_temp.mv(pg_temp.fri(), 16, 30), pg_temp.mv(pg_temp.fri(), 18, 30), 'Villimalé Beach Hut', 'Villimalé', 'Beach side, Villimalé', 4.1722, 73.4834,
  'Ferry from Malé every 10 minutes, then a 5 minute walk.', null, 'Short Eats Club',
  'Twelve kinds of hedhikaa made in front of you, from bajiya and gulha to keemia, with sweet black tea. Vegetarian options on the day.',
  '{}'),
('male-fun-run', 'scheduled', null, 'Malé Seafront 5K Fun Run', 'Sport',
  pg_temp.mv(9, 6), pg_temp.mv(9, 8), 'Raalhugandu', 'Malé', 'Boduthakurufaanu Magu, Malé', 4.1717, 73.5195,
  'Start line by Raalhugandu, east end of Malé.', null, 'Run Malé',
  'An early 5K loop along the seafront before the heat. Timing chip, finisher medal and a fresh coconut at the end. Walkers welcome.',
  '{}'),
('maafushi-sandbank-concert', 'scheduled', null, 'Sandbank Sunset Concert', 'Music',
  pg_temp.mv(12, 16), pg_temp.mv(12, 20), 'Maafushi Sandbank', 'Maafushi', 'Kaafu Atoll', 3.9418, 73.4903,
  'Speedboat from Maafushi harbour at 4pm, included. Ferry to Maafushi from Malé not included.', null, 'Maafushi Live',
  'A small band on a strip of sand in the middle of the lagoon as the sun goes down. Capacity is set by the boats, so it sells out fast.',
  array['Zero Degree Band']);

insert into public.tiers (event_id, position, name, description, price, capacity) values
('boduberu-artificial-beach', 0, 'Free entry', 'Standing on the beach', 0, 800),
('hulhumale-night-market', 0, 'Free entry', 'Pay at the stalls', 0, 2000),
('sunset-dolphin-cruise', 0, 'Adult', 'Seat on the dhoni', 45000, 18),
('sunset-dolphin-cruise', 1, 'Child (under 12)', 'Seat on the dhoni', 25000, 8),
('thulusdhoo-surf-day', 0, 'Lesson + transfer', 'Board, lunch and speedboat', 120000, 0),
('futsal-final', 0, 'Stand', 'Unreserved seating', 5000, 300),
('futsal-final', 1, 'Pitchside', 'Front row benches', 12000, 40),
('acoustic-hulhumale', 0, 'Entry + drink', 'Unreserved seating', 15000, 60),
('manta-snorkel-baa', 0, 'Snorkeller', 'Boat, guide, gear, reserve fee', 185000, 6),
('mv-art-space', 0, 'Free entry', 'Walk in any time', 0, 1000),
('mv-art-space', 1, 'Entry + drawing workshop', '90 minutes, materials included', 30000, 10),
('fuvahmulah-shark-dive', 0, 'Two dives', 'Boat, guide, tanks and weights', 230000, 8),
('fuvahmulah-shark-dive', 1, 'Two dives + full gear', 'Everything above plus BCD, regulator, wetsuit', 280000, 4),
('hedhikaa-evening', 0, 'Tasting plate', 'Twelve short eats and tea', 12000, 45),
('male-fun-run', 0, 'Runner', 'Chip timing, medal, coconut', 20000, 350),
('maafushi-sandbank-concert', 0, 'Early bird', 'Boat and soft drinks', 60000, 0),
('maafushi-sandbank-concert', 1, 'General', 'Boat and soft drinks', 75000, 22);

-- Local test account: admin@eventspace.mv / password123 (the app offers a
-- one-tap sign-in in development builds). It owns every sample event and
-- space, so one login can test sales, door check-in and rental requests.
-- Seed data is never pushed to hosted projects.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'admin@eventspace.mv', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"full_name":"Test Admin"}',
  now(), now(), '', '', '', '', '', '', '', ''
);
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (
  '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001',
  '{"sub":"00000000-0000-4000-8000-000000000001","email":"admin@eventspace.mv","email_verified":true}',
  'email', now(), now(), now()
);
update public.events set owner_id = '00000000-0000-4000-8000-000000000001';
-- Each sample organiser gets its own page.
update public.events set organizer_id = private.organizer_for(owner_id, organizer_name);
update public.organizers set bio = case name
  when 'Rhythm of the Atolls' then 'Bodu beru groups and island music, on beaches and in harbours across the Maldives.'
  when 'Blue Dhoni Trips' then 'Small-group dhoni trips from Malé: dolphins at dusk, sandbanks and night fishing.'
  when 'Malé Art Space' then 'A gallery and studio in central Malé showing Maldivian artists and running weekend workshops.'
  else 'Events in the Maldives on Tikkit.'
end;

insert into public.venues (owner_id, name, area, address, lat, lng, access, capacity, description, amenities, image_url, for_rent, hourly_rate, min_hours) values
('00000000-0000-4000-8000-000000000001', 'Rooftop 11', 'Malé', 'Majeedhee Magu, Malé', 4.1745, 73.5110,
  'Lift to the 11th floor. Loading through the back entrance on Ameenee Magu.', 120,
  'An open rooftop over central Malé with sea views on three sides. Good for launches, acoustic sets and dinners. Shade sails cover half the deck.',
  array['Sound system', 'Lighting', 'Bar', 'Toilets'], null, true, 150000, 3),
('00000000-0000-4000-8000-000000000001', 'Beach Hall', 'Hulhumalé', 'Nirolhu Magu, Hulhumalé Phase 1', 4.2130, 73.5410,
  'Bus from Malé or a 15 minute drive over Sinamalé Bridge.', 300,
  'A covered hall that opens onto the beach. Stage, chairs for 200 and a kitchen for caterers. Popular for weddings, concerts and markets.',
  array['Stage', 'Sound system', 'Kitchen', 'Air conditioning', 'Parking', 'Step-free access'],
  null, true, 250000, 4),
('00000000-0000-4000-8000-000000000001', 'Studio 7', 'Malé', 'Orchid Magu, Malé', 4.1760, 73.5080,
  'Five minutes from the Jumhooree Maidhaan.', 40,
  'A quiet white-walled studio for workshops, talks and small exhibitions. Projector and folding tables included.',
  array['Projector', 'Wi-Fi', 'Air conditioning'], null, true, 40000, 2);

-- ---------------------------------------------------------------------------
-- Trust, money and growth samples
-- ---------------------------------------------------------------------------

-- The test account is an admin and a verified organiser, so it can try every
-- side of the app. Its sample spaces are verified.
insert into private.admins (user_id) values ('00000000-0000-4000-8000-000000000001');
update public.profiles set verified_at = now() where id = '00000000-0000-4000-8000-000000000001';
update public.organizers set verified = true where owner_id = '00000000-0000-4000-8000-000000000001';
update public.venues set verified_at = now() where owner_id = '00000000-0000-4000-8000-000000000001';

-- Two more people, both with password123:
--   aminath@eventspace.mv  a verified organiser with her own events (not an admin)
--   newbie@eventspace.mv   just signed up: verification waiting, one draft,
--                          one space waiting for its venue check
create function pg_temp.person(p_id uuid, p_email text, p_name text) returns void language sql as $$
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt('password123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', p_name),
    now() - interval '90 days', now(), '', '', '', '', '', '', '', ''
  );
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (p_id::text, p_id, jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true), 'email', now(), now(), now());
$$;
select pg_temp.person('00000000-0000-4000-8000-000000000002', 'aminath@eventspace.mv', 'Aminath Shiuna');
select pg_temp.person('00000000-0000-4000-8000-000000000003', 'newbie@eventspace.mv', 'Ahmed Nashid');
update public.profiles set verified_at = now() - interval '60 days' where id = '00000000-0000-4000-8000-000000000002';

insert into public.verifications (user_id, kind, status, legal_name, phone, id_kind, id_number, document_path, reviewed_at, created_at) values
('00000000-0000-4000-8000-000000000002', 'identity', 'approved', 'Aminath Shiuna', '+960 777 4821', 'national_id', 'A284917',
  '00000000-0000-4000-8000-000000000002/id-front.jpg', now() - interval '60 days', now() - interval '61 days'),
('00000000-0000-4000-8000-000000000003', 'identity', 'pending', 'Ahmed Nashid', '+960 955 1037', 'business', 'C-0931/2024',
  '00000000-0000-4000-8000-000000000003/registration.pdf', null, now() - interval '3 hours');
update public.verifications set business_name = 'Lagoon Nights Pvt Ltd' where id_kind = 'business';

insert into public.events (id, owner_id, listing, title, category, starts_at, ends_at, venue_name, venue_area, venue_address, lat, lng, access, organizer_name, description, lineup) values
('rooftop-deep-house', '00000000-0000-4000-8000-000000000002', 'approved', 'Rooftop 11: Deep House Night', 'Nightlife',
  pg_temp.mv(pg_temp.fri(), 21), pg_temp.mv(pg_temp.fri() + 1, 1), 'Rooftop 11', 'Malé', 'Majeedhee Magu, Malé', 4.1745, 73.5110,
  'Lift to the 11th floor. Last ferry to Hulhumalé leaves at 1:30.', 'Shiuna Sessions',
  'Warm deep house over the lights of Malé, with two residents and a guest from Colombo. Mocktail bar all night. Over 18s, ID checked at the door.',
  array['DJ Kai (Colombo)', 'Shiuna', 'Nooh B2B Raffu']),
('kids-reef-day', '00000000-0000-4000-8000-000000000002', 'approved', 'Kids’ Reef Discovery Morning', 'Family',
  pg_temp.mv(pg_temp.fri() + 1, 8), pg_temp.mv(pg_temp.fri() + 1, 11), 'Hulhumalé Beach', 'Hulhumalé', 'Beach front, Hulhumalé Phase 1', 4.2190, 73.5450,
  'Meet at the lifeguard tower by the beach front. Parents stay on the beach.', 'Shiuna Sessions',
  'Marine biologists lead children aged 6 to 12 through the shallow reef: crabs, sea cucumbers and baby reef sharks. Masks and rash vests provided, one guide for every four children.',
  '{}'),
('sunrise-yoga-villimale', '00000000-0000-4000-8000-000000000002', 'approved', 'Sunrise Yoga on the Jetty', 'Wellness',
  pg_temp.mv(4, 6), pg_temp.mv(4, 7, 15), 'Villimalé Jetty', 'Villimalé', 'South jetty, Villimalé', 4.1712, 73.4842,
  'Ferry from Malé every 10 minutes. Mats provided, or bring your own.', 'Shiuna Sessions',
  'A gentle 75 minute flow as the sun comes up over the lagoon, for every level. Cold coconut water afterwards.',
  '{}'),
('bashi-night', null, 'approved', 'Bashi Under the Lights', 'Sport',
  pg_temp.mv(6, 20), pg_temp.mv(6, 22), 'Henveiru Stadium', 'Malé', 'Henveiru, Malé', 4.1757, 73.5149,
  'Five minutes from Raalhugandu. Seating in the east stand.', 'Women in Sport MV',
  'Eight island teams play the traditional women’s game under floodlights, with commentary in Dhivehi and English. Bring a cushion for the stand.',
  '{}'),
('dhoni-night-fishing', null, 'approved', 'Night Fishing on a Dhoni', 'Water',
  pg_temp.mv(pg_temp.fri(), 18), pg_temp.mv(pg_temp.fri(), 22), 'Jetty 7', 'Malé', 'North Harbour, Malé', 4.1790, 73.5100,
  'Boarding at Jetty 7, North Harbour. Arrive 15 minutes early.', 'Blue Dhoni Trips',
  'Handline fishing the Maldivian way off the reef edge. The crew cooks the catch on board as a barbecue dinner. Lines, bait and dinner included.',
  '{}'),
('comedy-night-male', null, 'approved', 'Stand-up in Malé: Island Fever', 'Comedy',
  pg_temp.mv(7, 20, 30), pg_temp.mv(7, 22, 30), 'Studio 7', 'Malé', 'Orchid Magu, Malé', 4.1760, 73.5080,
  'Five minutes from the Jumhooree Maidhaan.', 'Laugh MV',
  'Six local comics on ferries, family WhatsApp groups and island traffic. Mostly in English with some Dhivehi. Not for under 16s.',
  array['Moosa the Mild', 'Shaana', 'Big Ibbe', 'Laisha R.', 'Fathih', 'Open mic slot']),
('lagoon-nights-launch', '00000000-0000-4000-8000-000000000003', 'pending', 'Lagoon Nights: Opening Party', 'Music',
  pg_temp.mv(10, 21), pg_temp.mv(10, 24), 'Beach Hall', 'Hulhumalé', 'Nirolhu Magu, Hulhumalé Phase 1', 4.2130, 73.5410,
  'Bus from Malé or a 15 minute drive over Sinamalé Bridge.', 'Lagoon Nights',
  'The first Lagoon Nights party: three DJs, a beach bar and fire dancers on the sand. Early bird tickets are limited.',
  array['DJ Reef', 'Saffy', 'Fire crew']);

update public.events set owner_id = '00000000-0000-4000-8000-000000000001' where owner_id is null;
update public.events set organizer_id = private.organizer_for(owner_id, organizer_name) where organizer_id is null;
update public.organizers set verified = true where owner_id = '00000000-0000-4000-8000-000000000002';
update public.organizers set bio = case name
  when 'Shiuna Sessions' then 'Aminath Shiuna runs music nights and family mornings in Malé and Hulhumalé.'
  when 'Women in Sport MV' then 'Leagues, clinics and match nights for women’s sport across the islands.'
  when 'Laugh MV' then 'Stand-up comedy nights in Malé, with new local comics every month.'
  when 'Lagoon Nights' then 'Beach parties in Hulhumalé.'
  else bio
end;
update public.events set fee_mode = 'absorb' where id in ('futsal-final', 'male-fun-run');

insert into public.tiers (event_id, position, name, description, price, capacity) values
('rooftop-deep-house', 0, 'Early bird', 'Entry before 11pm', 25000, 0),
('rooftop-deep-house', 1, 'General', 'Entry all night', 35000, 150),
('rooftop-deep-house', 2, 'Table for 4', 'Reserved table and a mocktail jug', 200000, 6),
('kids-reef-day', 0, 'Child', 'Guide, mask and rash vest', 35000, 24),
('sunrise-yoga-villimale', 0, 'Drop-in', 'Mat and coconut water', 10000, 30),
('bashi-night', 0, 'Free entry', 'East stand', 0, 600),
('dhoni-night-fishing', 0, 'Angler', 'Lines, bait and barbecue dinner', 55000, 14),
('comedy-night-male', 0, 'Seat', 'Unreserved seating', 20000, 40),
('comedy-night-male', 1, 'Front row', 'You may become part of the show', 30000, 8),
('lagoon-nights-launch', 0, 'Early bird', 'Entry and one drink', 30000, 100),
('lagoon-nights-launch', 1, 'General', 'Entry and one drink', 45000, 300);

-- Speedboat transfers sold with tickets.
insert into public.event_addons (event_id, kind, position, name, description, price, capacity, sold, departs_at) values
('maafushi-sandbank-concert', 'transfer', 0, 'Speedboat from Malé', 'Jetty 1, return after the show', 35000, 30, 12, pg_temp.mv(12, 14, 30)),
('maafushi-sandbank-concert', 'transfer', 1, 'Speedboat from Hulhumalé', 'Hulhumalé ferry terminal, return after the show', 40000, 20, 4, pg_temp.mv(12, 14, 15)),
('thulusdhoo-surf-day', 'extra', 0, 'Board rental for the weekend', 'Keep the board until Sunday', 25000, 10, 0, null),
('rooftop-deep-house', 'transfer', 0, 'Late boat to Hulhumalé', 'From North Harbour, drops at the ferry terminal', 7500, 40, 9, pg_temp.mv(pg_temp.fri() + 1, 1, 15)),
('manta-snorkel-baa', 'extra', 0, 'Underwater camera hire', 'GoPro with a 64 GB card, files sent by link', 30000, 4, 1, null);

insert into public.promoter_links (event_id, code, name, email, commission_pct) values
('maafushi-sandbank-concert', 'zara', 'Zara (Instagram)', 'aminath@eventspace.mv', 10),
('rooftop-deep-house', 'nooh', 'Nooh', null, 12);

-- One promoted event, so the "Promoted" card shows on Explore.
insert into public.promotions (event_id, owner_id, days, amount, status, starts_at, ends_at)
values ('rooftop-deep-house', '00000000-0000-4000-8000-000000000002', 3, 45000, 'active', now() - interval '1 day', now() + interval '2 days');

insert into public.collections (slug, title, subtitle, position) values
('on-the-water', 'On the water', 'Dhonis, reefs and sandbanks', 0),
('free-in-male', 'Free in Malé', 'No ticket needed, just turn up', 1),
('family-friendly', 'Family-friendly', 'Good for kids and grandparents', 2),
('after-dark', 'After dark', 'Music and nights out', 3);
insert into public.collection_events (collection_id, event_id, position)
select c.id, x.event_id, x.pos from public.collections c
join (values
  ('on-the-water', 'sunset-dolphin-cruise', 0), ('on-the-water', 'dhoni-night-fishing', 1),
  ('on-the-water', 'manta-snorkel-baa', 2), ('on-the-water', 'thulusdhoo-surf-day', 3), ('on-the-water', 'fuvahmulah-shark-dive', 4),
  ('free-in-male', 'boduberu-artificial-beach', 0), ('free-in-male', 'mv-art-space', 1), ('free-in-male', 'bashi-night', 2),
  ('free-in-male', 'hulhumale-night-market', 3),
  ('family-friendly', 'kids-reef-day', 0), ('family-friendly', 'hulhumale-night-market', 1), ('family-friendly', 'male-fun-run', 2),
  ('family-friendly', 'hedhikaa-evening', 3),
  ('after-dark', 'rooftop-deep-house', 0), ('after-dark', 'maafushi-sandbank-concert', 1), ('after-dark', 'acoustic-hulhumale', 2),
  ('after-dark', 'comedy-night-male', 3)
) as x(slug, event_id, pos) on x.slug = c.slug;

-- A space waiting for its venue check, and one past booking with a review.
insert into public.venues (owner_id, name, area, address, access, capacity, description, amenities, for_rent, hourly_rate, min_hours) values
('00000000-0000-4000-8000-000000000003', 'Sandbar Deck', 'Hulhumalé', 'Beach front, Hulhumalé Phase 2', 'Phase 2 bus stop, then a 3 minute walk.', 80,
  'A timber deck over the lagoon with string lights and a small bar. Sunsets straight ahead.',
  array['Bar', 'Outdoor space', 'Lighting'], true, 90000, 3);
insert into public.verifications (user_id, kind, status, legal_name, venue_id, proof_path, lat, lng, note, created_at)
select '00000000-0000-4000-8000-000000000003', 'venue', 'pending', 'Ahmed Nashid', id,
  '00000000-0000-4000-8000-000000000003/lease.pdf', 4.2398, 73.5398, 'Lease with the Housing Development Corporation attached.', now() - interval '2 hours'
from public.venues where name = 'Sandbar Deck';

insert into public.venue_bookings (venue_id, requester_id, requester_name, requester_email, owner_email, starts_at, ends_at, status, total, decided_at, paid_at)
select id, '00000000-0000-4000-8000-000000000002', 'Aminath Shiuna', 'aminath@eventspace.mv', 'admin@eventspace.mv',
  pg_temp.mv(-20, 19), pg_temp.mv(-20, 23), 'approved', 600000, now() - interval '30 days', now() - interval '29 days'
from public.venues where name = 'Rooftop 11';
insert into public.venue_reviews (booking_id, venue_id, author_id, author_name, rating, body, reply, replied_at)
select b.id, b.venue_id, b.requester_id, 'Aminath Shiuna', 5,
  'Sound was great, the lift was the only bottleneck at the start. The view sold the night for us.',
  'Thanks Aminath. We now run a second lift for the first hour.', now() - interval '15 days'
from public.venue_bookings b where b.requester_id = '00000000-0000-4000-8000-000000000002';

-- An open report, so the admin queue has something in it.
insert into public.reports (reporter_id, target_kind, target_id, subject_id, reason, details)
values ('00000000-0000-4000-8000-000000000003', 'event', 'comedy-night-male', '00000000-0000-4000-8000-000000000001', 'wrong_info',
  'The start time on the poster says 8pm, the listing says 8:30.');

insert into public.notifications (user_id, kind, title, body, link) values
('00000000-0000-4000-8000-000000000001', 'welcome', 'Welcome to Tikkit',
  'This test account is an admin. Open Account, then Admin, to review the sample queue.', '/admin');

-- ---------------------------------------------------------------------------
-- Series, seats, memberships and reviews
-- ---------------------------------------------------------------------------

-- A weekly quiz: four dates in one series.
insert into public.events (id, owner_id, organizer_id, series_id, listing, title, category, starts_at, ends_at, venue_name, venue_area, venue_address, lat, lng, access, organizer_name, description)
select 'thursday-quiz-' || n, '00000000-0000-4000-8000-000000000001',
  private.organizer_for('00000000-0000-4000-8000-000000000001', 'Quiz Club MV'),
  '5e7e5000-0000-4000-8000-000000000001', 'approved', 'Thursday Quiz Night', 'Culture',
  pg_temp.mv(((4 - extract(dow from now() at time zone 'Indian/Maldives')::int + 7) % 7) + 7 * n, 20),
  pg_temp.mv(((4 - extract(dow from now() at time zone 'Indian/Maldives')::int + 7) % 7) + 7 * n, 22),
  'Studio 7', 'Malé', 'Orchid Magu, Malé', 4.1760, 73.5080, 'Five minutes from the Jumhooree Maidhaan.', 'Quiz Club MV',
  'Teams of up to six, five rounds, one picture round about the islands. The winning team takes home the jar.'
from generate_series(0, 3) n;
insert into public.tiers (event_id, position, name, description, price, capacity)
select 'thursday-quiz-' || n, 0, 'Team player', 'Join any team on the night', 5000, 60 from generate_series(0, 3) n;

-- The comedy night is seated: 4 rows of 10, plus a front row of 8.
update public.tiers set seated = true where event_id = 'comedy-night-male';
insert into public.seats (event_id, tier_id, section, row_label, number, position)
select 'comedy-night-male', t.id, 'Stalls', chr(65 + r), n, r * 10 + n
from public.tiers t, generate_series(0, 3) r, generate_series(1, 10) n
where t.event_id = 'comedy-night-male' and t.name = 'Seat';
insert into public.seats (event_id, tier_id, section, row_label, number, position)
select 'comedy-night-male', t.id, 'Front', 'A', n, 100 + n
from public.tiers t, generate_series(1, 8) n
where t.event_id = 'comedy-night-male' and t.name = 'Front row';
-- A few already taken, so the map looks real.
update public.seats set status = 'sold' where event_id = 'comedy-night-male' and (row_label, number) in (('A', 4), ('A', 5), ('A', 6), ('B', 5), ('B', 6), ('C', 1), ('C', 2));

-- A gala dinner seated at round tables: 10 tables of 8 in the ballroom, two
-- VIP tables of 6 at the front, a few seats sold and two held for sponsors.
insert into public.events (id, owner_id, organizer_id, listing, title, category, starts_at, ends_at, venue_name, venue_area, venue_address, lat, lng, access, image_url, organizer_name, description)
values ('charity-gala-dinner', '00000000-0000-4000-8000-000000000001',
  private.organizer_for('00000000-0000-4000-8000-000000000001', 'Reef Hearts Foundation'), 'approved',
  'Reef Hearts Charity Gala Dinner', 'Charity', pg_temp.mv(9, 19, 30), pg_temp.mv(9, 23),
  'Grand Ballroom', 'Malé', 'Boduthakurufaanu Magu, Malé', 4.1745, 73.5120, 'Valet at the main entrance.',
  null, 'Reef Hearts Foundation',
  'A four-course dinner with live music, raising money for coral restoration in North Malé Atoll. Book a seat, or a whole table for your team.');
insert into public.tiers (event_id, position, name, description, price, capacity, seated) values
('charity-gala-dinner', 0, 'VIP table seat', 'Front tables, welcome drink and a reef tour voucher', 150000, 10, true),
('charity-gala-dinner', 1, 'Dinner seat', 'Four-course dinner and live music', 75000, 80, true);
insert into public.seats (event_id, tier_id, section, row_label, number, position, kind)
select 'charity-gala-dinner', t.id, 'VIP', g::text, n, g * 10 + n, 'table'
from public.tiers t, generate_series(1, 2) g, generate_series(1, 6) n
where t.event_id = 'charity-gala-dinner' and t.name = 'VIP table seat';
insert into public.seats (event_id, tier_id, section, row_label, number, position, kind)
select 'charity-gala-dinner', t.id, 'Ballroom', (g + 2)::text, n, 100 + g * 10 + n, 'table'
from public.tiers t, generate_series(1, 10) g, generate_series(1, 8) n
where t.event_id = 'charity-gala-dinner' and t.name = 'Dinner seat';
update public.seats set status = 'sold' where event_id = 'charity-gala-dinner'
  and (row_label, number) in (('3', 1), ('3', 2), ('3', 3), ('3', 4), ('5', 1), ('5', 2), ('8', 5), ('8', 6), ('8', 7), ('8', 8));
update public.seats set status = 'blocked' where event_id = 'charity-gala-dinner' and row_label = '1' and number in (1, 2);

-- A membership with a members-only presale.
insert into public.memberships (organizer_id, name, perks, price, period, discount_pct)
select id, 'Shiuna Sessions Insiders', 'Tickets 3 days before everyone else, 10% off every night, and a guest list spot once a season.', 60000, 'year', 10
from public.organizers where name = 'Shiuna Sessions';
insert into public.events (id, owner_id, listing, public_sale_at, title, category, starts_at, ends_at, venue_name, venue_area, venue_address, lat, lng, access, organizer_name, description, lineup)
values ('full-moon-rooftop', '00000000-0000-4000-8000-000000000002', 'approved', pg_temp.mv(3, 18), 'Full Moon on the Rooftop', 'Music',
  pg_temp.mv(16, 21), pg_temp.mv(17, 1), 'Rooftop 11', 'Malé', 'Majeedhee Magu, Malé', 4.1745, 73.5110,
  'Lift to the 11th floor.', 'Shiuna Sessions',
  'A full moon, a live sax player over a slow house set, and the city lights below. Members get tickets three days early.',
  array['Shiuna', 'Live sax: Ahmed Ziyan']);
update public.events set organizer_id = private.organizer_for(owner_id, organizer_name) where id = 'full-moon-rooftop';
insert into public.tiers (event_id, position, name, description, price, capacity) values
('full-moon-rooftop', 0, 'General', 'Entry all night', 40000, 140);

-- A past night with reviews from people who were there.
insert into public.events (id, owner_id, listing, title, category, starts_at, ends_at, venue_name, venue_area, venue_address, lat, lng, organizer_name, description)
values ('boduberu-last-month', '00000000-0000-4000-8000-000000000001', 'approved', 'Bodu Beru Night: Harbour Edition', 'Culture',
  pg_temp.mv(-24, 20), pg_temp.mv(-24, 22), 'North Harbour', 'Malé', 'North Harbour, Malé', 4.1790, 73.5100, 'Rhythm of the Atolls',
  'Three bodu beru groups on the harbour front. Free and open to everyone.');
update public.events set organizer_id = private.organizer_for(owner_id, organizer_name) where id = 'boduberu-last-month';
insert into public.organizer_reviews (organizer_id, event_id, user_id, author_name, rating, body)
select organizer_id, 'boduberu-last-month', u, n, r, b from public.events,
  (values ('00000000-0000-4000-8000-000000000002'::uuid, 'Aminath', 5, 'Started on time, sound was great and the crowd control was calm. Bringing my parents next time.'),
          ('00000000-0000-4000-8000-000000000003'::uuid, 'Ahmed', 4, 'Brilliant drummers. More shade near the stage would help.')) as x(u, n, r, b)
where id = 'boduberu-last-month';

insert into public.collection_events (collection_id, event_id, position)
select id, 'thursday-quiz-0', 5 from public.collections where slug = 'after-dark';

-- ---------------------------------------------------------------------------
-- Photos for the samples (Unsplash License, hotlinked as Unsplash asks).
-- Real organisers upload their own; events without one get a drawn cover.
-- ---------------------------------------------------------------------------
create function pg_temp.photo(p text) returns text language sql as $$
  select 'https://images.unsplash.com/' || p || '?w=1200&q=75&fm=jpg&fit=crop'
$$;
update public.events e set image_url = pg_temp.photo(x.p) from (values
  ('boduberu-artificial-beach', 'photo-1523689119443-df96632084a1'),
  ('hulhumale-night-market', 'photo-1535898331935-2d274aff0fbc'),
  ('sunset-dolphin-cruise', 'photo-1591014148345-40a3256ad822'),
  ('thulusdhoo-surf-day', 'photo-1601505804121-45e2c5506c94'),
  ('futsal-final', 'photo-1763775594018-4a84eeadd83d'),
  ('acoustic-hulhumale', 'photo-1545224144-b38cd309ef69'),
  ('manta-snorkel-baa', 'photo-1542443605-fcefd6550d4a'),
  ('mv-art-space', 'photo-1735605917461-4c1b77a6616f'),
  ('fuvahmulah-shark-dive', 'photo-1560275619-4cc5fa59d3ae'),
  ('hedhikaa-evening', 'photo-1733959541069-1a289a05a59f'),
  ('male-fun-run', 'photo-1745790289741-12a211a8325d'),
  ('maafushi-sandbank-concert', 'photo-1671983466651-59b9b0a807c5'),
  ('rooftop-deep-house', 'photo-1679746556827-a4722297a613'),
  ('kids-reef-day', 'photo-1717293520171-b1d8b5d5e3f2'),
  ('sunrise-yoga-villimale', 'photo-1697898109117-cb8847116f8d'),
  ('bashi-night', 'photo-1695950695168-f4038b55a9ca'),
  ('dhoni-night-fishing', 'photo-1698685898414-980f0d9bea13'),
  ('comedy-night-male', 'photo-1728674115193-6febdf9fe365'),
  ('lagoon-nights-launch', 'photo-1603910234616-3b5f4a6be2b4'),
  ('full-moon-rooftop', 'photo-1470229722913-7c0e2dbbafd3'),
  ('boduberu-last-month', 'photo-1588032786045-59cefda005c0')
) as x(id, p) where e.id = x.id;
update public.events set image_url = pg_temp.photo('photo-1718942900361-d01a1ee8d077') where id like 'thursday-quiz-%';
update public.venues v set image_url = pg_temp.photo(x.p) from (values
  ('Rooftop 11', 'photo-1608479709386-98826dbb642b'),
  ('Beach Hall', 'photo-1620065487644-1080510335f5'),
  ('Studio 7', 'photo-1613635423272-ef6bfd72ac0b'),
  ('Sandbar Deck', 'photo-1586495985096-787fb4a54ac0')
) as x(name, p) where v.name = x.name;

-- Dive and snorkel trips sold to visitors are priced in US dollars (cents).
update public.events set currency = 'USD' where id in ('manta-snorkel-baa', 'fuvahmulah-shark-dive');
update public.tiers set price = 12000 where event_id = 'manta-snorkel-baa' and name = 'Snorkeller';
update public.tiers set price = 15000 where event_id = 'fuvahmulah-shark-dive' and name = 'Two dives';
update public.tiers set price = 18000 where event_id = 'fuvahmulah-shark-dive' and name = 'Two dives + full gear';
update public.event_addons set price = 2000 where event_id = 'manta-snorkel-baa';
