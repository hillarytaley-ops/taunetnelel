-- Ensure ended picnic / language festival cannot sit in Upcoming.
-- (Ids keep the historical *-2026 slug; calendar dates are past.)

update public.events
set
  start_at = '2025-08-10T11:00:00+10:00',
  end_at = '2025-08-10T16:00:00+10:00',
  meta = 'Saturday, 10 August 2025 · 11am–4pm',
  badge = 'Family day',
  registration_open = false
where id = 'community-picnic-2026';

update public.events
set
  start_at = '2025-09-21T10:00:00+10:00',
  end_at = '2025-09-21T15:00:00+10:00',
  meta = 'Sunday, 21 September 2025 · 10am–3pm',
  badge = 'Culture',
  registration_open = false
where id = 'language-festival-2026';

update public.events
set badge = 'Culture week'
where id = 'cultural-week-2026' and badge = 'Live now';
