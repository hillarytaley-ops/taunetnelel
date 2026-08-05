-- Ticket price options for public Book & PayID (e.g. Single $100 / Two people $150).
alter table public.events
  add column if not exists ticket_prices jsonb;

comment on column public.events.ticket_prices is
  'JSON array of {id,label,amount_cents} ticket options for the public PayID booking portal.';

-- Seed Men's Camp defaults when the row exists.
update public.events
set
  fee_cents = coalesce(fee_cents, 10000),
  ticket_prices = coalesce(
    ticket_prices,
    '[
      {"id":"single","label":"Single","amount_cents":10000},
      {"id":"couple","label":"Two people","amount_cents":15000}
    ]'::jsonb
  ),
  booking_url = coalesce(booking_url, 'pay/event.html?event=men-s-camp-2026-08-01'),
  registration_open = true
where id = 'men-s-camp-2026-08-01';
