-- More kinds of event. Enum values are added in their own migration because
-- a new value can't be used in the transaction that adds it.
alter type public.event_category add value if not exists 'Nightlife';
alter type public.event_category add value if not exists 'Comedy';
alter type public.event_category add value if not exists 'Film';
alter type public.event_category add value if not exists 'Wellness';
alter type public.event_category add value if not exists 'Talks';
alter type public.event_category add value if not exists 'Workshop';
alter type public.event_category add value if not exists 'Family';
alter type public.event_category add value if not exists 'Festival';
alter type public.event_category add value if not exists 'Charity';
