-- Run in Supabase SQL Editor, then redeploy the site.
-- Admin: Committee admin → CRM records
-- Members: /members/welfare.html (member-visible fields only)
-- Sensitive fields (income, employer, bank, ID) stay Admin-only.
-- Safe to re-run.

-- CRM custom fields (Mambo Mob-style member register).

create table if not exists public.crm_custom_fields (
  id uuid primary key default gen_random_uuid(),
  field_key text not null unique,
  label text not null,
  help_text text,
  field_type text not null check (field_type in (
    'text', 'textarea', 'number', 'date', 'select', 'phone', 'email', 'toggle', 'money'
  )),
  field_group text not null default 'contact' check (field_group in (
    'contact', 'personal', 'welfare', 'beneficiary', 'employment',
    'financial', 'communications', 'committee'
  )),
  options jsonb not null default '[]'::jsonb,
  visibility text not null default 'member' check (visibility in ('member', 'admin')),
  member_editable boolean not null default true,
  is_sensitive boolean not null default false,
  is_active boolean not null default true,
  is_system boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_field_key_format check (field_key ~ '^[a-z][a-z0-9_]{1,62}$'),
  constraint crm_sensitive_admin_only check (
    not is_sensitive or (visibility = 'admin' and member_editable = false)
  )
);

create table if not exists public.crm_field_values (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  field_key text not null references public.crm_custom_fields (field_key) on update cascade on delete cascade,
  value_text text,
  updated_at timestamptz not null default now(),
  unique (profile_id, field_key)
);

create index if not exists crm_custom_fields_group_idx
  on public.crm_custom_fields (field_group, sort_order);

create index if not exists crm_field_values_profile_idx
  on public.crm_field_values (profile_id);

alter table public.crm_custom_fields enable row level security;
alter table public.crm_field_values enable row level security;

revoke all on table public.crm_custom_fields from public, anon;
revoke all on table public.crm_field_values from public, anon;
grant select on table public.crm_custom_fields to authenticated;
grant select, insert, update on table public.crm_field_values to authenticated;
grant all on table public.crm_custom_fields to service_role;
grant all on table public.crm_field_values to service_role;

drop policy if exists "members read member-visible fields" on public.crm_custom_fields;
create policy "members read member-visible fields"
  on public.crm_custom_fields
  for select
  to authenticated
  using (is_active = true and visibility = 'member');

drop policy if exists "members read own member-visible values" on public.crm_field_values;
create policy "members read own member-visible values"
  on public.crm_field_values
  for select
  to authenticated
  using (
    profile_id = auth.uid()
    and exists (
      select 1 from public.crm_custom_fields f
      where f.field_key = crm_field_values.field_key
        and f.is_active
        and f.visibility = 'member'
    )
  );

drop policy if exists "members upsert own member-editable values" on public.crm_field_values;
create policy "members upsert own member-editable values"
  on public.crm_field_values
  for insert
  to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.crm_custom_fields f
      where f.field_key = crm_field_values.field_key
        and f.is_active
        and f.visibility = 'member'
        and f.member_editable
    )
  );

drop policy if exists "members update own member-editable values" on public.crm_field_values;
create policy "members update own member-editable values"
  on public.crm_field_values
  for update
  to authenticated
  using (
    profile_id = auth.uid()
    and exists (
      select 1 from public.crm_custom_fields f
      where f.field_key = crm_field_values.field_key
        and f.is_active
        and f.visibility = 'member'
        and f.member_editable
    )
  )
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.crm_custom_fields f
      where f.field_key = crm_field_values.field_key
        and f.is_active
        and f.visibility = 'member'
        and f.member_editable
    )
  );

insert into public.crm_custom_fields (
  field_key, label, help_text, field_type, field_group, options,
  visibility, member_editable, is_sensitive, is_system, sort_order
)
select
  x->>'field_key',
  x->>'label',
  nullif(x->>'help_text', ''),
  x->>'field_type',
  x->>'field_group',
  coalesce(x->'options', '[]'::jsonb),
  coalesce(x->>'visibility', 'member'),
  coalesce((x->>'member_editable')::boolean, true),
  coalesce((x->>'is_sensitive')::boolean, false),
  coalesce((x->>'is_system')::boolean, false),
  coalesce((x->>'sort_order')::int, 0)
from jsonb_array_elements($crm_seed$
[
  {"field_key":"title","label":"Title","field_type":"select","field_group":"contact","options":["Mr","Mrs","Ms","Miss","Dr","Other"],"sort_order":10},
  {"field_key":"preferred_name","label":"Preferred name","field_type":"text","field_group":"contact","sort_order":20},
  {"field_key":"middle_name","label":"Middle name","field_type":"text","field_group":"contact","sort_order":30},
  {"field_key":"street_address","label":"Street address","field_type":"text","field_group":"contact","sort_order":40},
  {"field_key":"suburb","label":"Suburb / city","field_type":"text","field_group":"contact","sort_order":50},
  {"field_key":"state","label":"State","field_type":"select","field_group":"contact","options":["VIC","NSW","QLD","SA","WA","TAS","NT","ACT","Overseas"],"sort_order":60},
  {"field_key":"postcode","label":"Postal code","field_type":"text","field_group":"contact","sort_order":70},
  {"field_key":"country","label":"Country","field_type":"text","field_group":"contact","sort_order":80},
  {"field_key":"preferred_contact","label":"Preferred contact method","field_type":"select","field_group":"contact","options":["Phone","Email","SMS","WhatsApp"],"sort_order":90},
  {"field_key":"whatsapp","label":"WhatsApp number","field_type":"phone","field_group":"contact","sort_order":100},
  {"field_key":"emergency_contact_name","label":"Emergency contact name","field_type":"text","field_group":"contact","sort_order":110},
  {"field_key":"emergency_contact_phone","label":"Emergency contact phone","field_type":"phone","field_group":"contact","sort_order":120},
  {"field_key":"emergency_contact_relationship","label":"Emergency contact relationship","field_type":"text","field_group":"contact","sort_order":130},

  {"field_key":"date_of_birth","label":"Date of birth","field_type":"date","field_group":"personal","sort_order":200},
  {"field_key":"gender","label":"Gender","field_type":"select","field_group":"personal","options":["Female","Male","Prefer not to say","Other"],"sort_order":210},
  {"field_key":"marital_status","label":"Marital status","field_type":"select","field_group":"personal","options":["Single","Married","De facto","Widowed","Divorced","Separated"],"sort_order":220},
  {"field_key":"partner_name","label":"Spouse / partner name","field_type":"text","field_group":"personal","sort_order":230},
  {"field_key":"place_of_birth","label":"Place of birth","field_type":"text","field_group":"personal","sort_order":240},
  {"field_key":"nationality","label":"Nationality","field_type":"text","field_group":"personal","sort_order":250},
  {"field_key":"preferred_language","label":"Preferred language","field_type":"text","field_group":"personal","sort_order":260},
  {"field_key":"languages_spoken","label":"Languages spoken","field_type":"text","field_group":"personal","sort_order":270},
  {"field_key":"kalenjin_subtribe","label":"Kalenjin sub-tribe / clan","field_type":"text","field_group":"personal","sort_order":280},
  {"field_key":"suburb_of_origin","label":"Place of origin (Kenya / home)","field_type":"text","field_group":"personal","sort_order":290},
  {"field_key":"year_arrived_australia","label":"Year arrived in Australia","field_type":"number","field_group":"personal","sort_order":300},
  {"field_key":"years_in_victoria","label":"Years in Victoria","field_type":"number","field_group":"personal","sort_order":310},
  {"field_key":"household_size","label":"Household size","field_type":"number","field_group":"personal","sort_order":320},
  {"field_key":"number_of_dependents","label":"Number of dependents","field_type":"number","field_group":"personal","sort_order":330},
  {"field_key":"dependents_details","label":"Dependents to cover","help_text":"Names and relationship, e.g. spouse, children","field_type":"textarea","field_group":"personal","sort_order":340},
  {"field_key":"children_names","label":"Children names and ages","field_type":"textarea","field_group":"personal","sort_order":350},
  {"field_key":"family_in_victoria","label":"Family in Victoria","field_type":"textarea","field_group":"personal","sort_order":360},
  {"field_key":"dietary_requirements","label":"Dietary requirements","field_type":"text","field_group":"personal","sort_order":370},
  {"field_key":"accessibility_needs","label":"Accessibility needs","field_type":"text","field_group":"personal","sort_order":380},
  {"field_key":"interpreter_needed","label":"Interpreter needed","field_type":"toggle","field_group":"personal","sort_order":390},
  {"field_key":"community_roles","label":"Community roles","field_type":"text","field_group":"personal","sort_order":400},
  {"field_key":"skills","label":"Skills","field_type":"text","field_group":"personal","sort_order":410},
  {"field_key":"volunteer_interest","label":"Volunteer interest","field_type":"textarea","field_group":"personal","sort_order":420},
  {"field_key":"church_or_community_group","label":"Church or community group","field_type":"text","field_group":"personal","sort_order":430},
  {"field_key":"photo_consent","label":"Photo / media consent","field_type":"toggle","field_group":"personal","sort_order":440},
  {"field_key":"consent_data_storage","label":"Consent to store welfare register details","field_type":"toggle","field_group":"personal","is_system":true,"sort_order":450},

  {"field_key":"cover_type","label":"Cover type","field_type":"select","field_group":"welfare","options":["Bereavement & hardship","Bereavement only"],"sort_order":500},
  {"field_key":"pension_scheme","label":"Pension / super scheme (if any)","field_type":"text","field_group":"welfare","sort_order":510},
  {"field_key":"spouse_welfare_member","label":"Spouse is also a welfare member","field_type":"toggle","field_group":"welfare","sort_order":520},
  {"field_key":"welfare_notes_member","label":"Notes for the Welfare Committee","field_type":"textarea","field_group":"welfare","sort_order":530},
  {"field_key":"welfare_membership_status","label":"Welfare membership status","field_type":"select","field_group":"welfare","options":["Active","Pending","Lapsed","Suspended","Not enrolled"],"visibility":"admin","member_editable":false,"sort_order":540},
  {"field_key":"welfare_package","label":"Welfare package","field_type":"select","field_group":"welfare","options":["Association + Welfare ($300)","Welfare only"],"visibility":"admin","member_editable":false,"sort_order":550},
  {"field_key":"date_admitted","label":"Date admitted to welfare","field_type":"date","field_group":"welfare","visibility":"admin","member_editable":false,"is_system":true,"sort_order":560},
  {"field_key":"waiting_period_ends","label":"Waiting period ends","field_type":"date","field_group":"welfare","visibility":"admin","member_editable":false,"sort_order":570},
  {"field_key":"contribution_amount","label":"Contribution amount","field_type":"money","field_group":"welfare","visibility":"admin","member_editable":false,"sort_order":580},
  {"field_key":"payment_status","label":"Payment status","field_type":"select","field_group":"welfare","options":["Paid","Instalments","Overdue","Unpaid"],"visibility":"admin","member_editable":false,"is_system":true,"sort_order":590},
  {"field_key":"instalment_plan","label":"Instalment plan","field_type":"select","field_group":"welfare","options":["None","90 days","Custom"],"visibility":"admin","member_editable":false,"sort_order":600},
  {"field_key":"contribution_method","label":"Contribution method","field_type":"select","field_group":"welfare","options":["PayID","Bank transfer","Cash","Stripe","Other"],"visibility":"admin","member_editable":false,"sort_order":610},
  {"field_key":"last_payment_date","label":"Last payment date","field_type":"date","field_group":"welfare","visibility":"admin","member_editable":false,"sort_order":620},
  {"field_key":"last_payment_amount","label":"Last payment amount","field_type":"money","field_group":"welfare","visibility":"admin","member_editable":false,"sort_order":630},
  {"field_key":"arrears_amount","label":"Arrears amount","field_type":"money","field_group":"welfare","visibility":"admin","member_editable":false,"sort_order":640},
  {"field_key":"claim_in_progress","label":"Claim in progress","field_type":"toggle","field_group":"welfare","visibility":"admin","member_editable":false,"sort_order":650},
  {"field_key":"last_claim_date","label":"Last claim date","field_type":"date","field_group":"welfare","visibility":"admin","member_editable":false,"sort_order":660},
  {"field_key":"last_claim_type","label":"Last claim type","field_type":"text","field_group":"welfare","visibility":"admin","member_editable":false,"sort_order":670},
  {"field_key":"last_claim_amount","label":"Last claim amount","field_type":"money","field_group":"welfare","visibility":"admin","member_editable":false,"sort_order":680},
  {"field_key":"previous_welfare_claim","label":"Previous welfare claim","field_type":"toggle","field_group":"welfare","visibility":"admin","member_editable":false,"sort_order":690},
  {"field_key":"next_review_date","label":"Next review date","field_type":"date","field_group":"welfare","visibility":"admin","member_editable":false,"sort_order":700},

  {"field_key":"nok_full_name","label":"Next of kin — full name","help_text":"Required by the Welfare Association constitution.","field_type":"text","field_group":"beneficiary","is_system":true,"sort_order":800},
  {"field_key":"nok_relationship","label":"Next of kin — relationship","field_type":"text","field_group":"beneficiary","is_system":true,"sort_order":810},
  {"field_key":"nok_phone","label":"Next of kin — phone","field_type":"phone","field_group":"beneficiary","is_system":true,"sort_order":820},
  {"field_key":"nok_email","label":"Next of kin — email","field_type":"email","field_group":"beneficiary","is_system":true,"sort_order":830},
  {"field_key":"nok_address","label":"Next of kin — address","field_type":"textarea","field_group":"beneficiary","is_system":true,"sort_order":840},
  {"field_key":"beneficiary_full_name","label":"Nominated beneficiary — full name","help_text":"Person who should receive bereavement support.","field_type":"text","field_group":"beneficiary","is_system":true,"sort_order":850},
  {"field_key":"beneficiary_relationship","label":"Nominated beneficiary — relationship","field_type":"text","field_group":"beneficiary","is_system":true,"sort_order":860},
  {"field_key":"beneficiary_phone","label":"Nominated beneficiary — phone","field_type":"phone","field_group":"beneficiary","is_system":true,"sort_order":870},
  {"field_key":"beneficiary_email","label":"Nominated beneficiary — email","field_type":"email","field_group":"beneficiary","is_system":true,"sort_order":880},
  {"field_key":"beneficiary_address","label":"Nominated beneficiary — address","field_type":"textarea","field_group":"beneficiary","is_system":true,"sort_order":890},
  {"field_key":"beneficiary_notes","label":"Beneficiary notes","field_type":"textarea","field_group":"beneficiary","is_system":true,"sort_order":900},

  {"field_key":"occupation","label":"Occupation","field_type":"text","field_group":"employment","sort_order":1000},
  {"field_key":"employment_status","label":"Employment status","field_type":"select","field_group":"employment","options":["Employed","Self-employed","Casual","Unemployed","Retired","Student","Other"],"sort_order":1010},
  {"field_key":"employer_name","label":"Employer name","field_type":"text","field_group":"employment","visibility":"admin","member_editable":false,"is_sensitive":true,"sort_order":1020},
  {"field_key":"work_phone","label":"Work phone","field_type":"phone","field_group":"employment","visibility":"admin","member_editable":false,"sort_order":1030},
  {"field_key":"monthly_income","label":"Monthly income","field_type":"money","field_group":"employment","visibility":"admin","member_editable":false,"is_sensitive":true,"sort_order":1040},

  {"field_key":"bank_name","label":"Bank name","field_type":"text","field_group":"financial","visibility":"admin","member_editable":false,"is_sensitive":true,"sort_order":1100},
  {"field_key":"account_name","label":"Account name","field_type":"text","field_group":"financial","visibility":"admin","member_editable":false,"is_sensitive":true,"sort_order":1110},
  {"field_key":"bsb","label":"BSB","field_type":"text","field_group":"financial","visibility":"admin","member_editable":false,"is_sensitive":true,"sort_order":1120},
  {"field_key":"account_number","label":"Account number","field_type":"text","field_group":"financial","visibility":"admin","member_editable":false,"is_sensitive":true,"sort_order":1130},
  {"field_key":"payid","label":"PayID","field_type":"text","field_group":"financial","visibility":"admin","member_editable":false,"is_sensitive":true,"sort_order":1140},
  {"field_key":"bank_account_verified","label":"Bank account verified","field_type":"toggle","field_group":"financial","visibility":"admin","member_editable":false,"sort_order":1150},
  {"field_key":"medicare_number","label":"Medicare number","field_type":"text","field_group":"financial","visibility":"admin","member_editable":false,"is_sensitive":true,"sort_order":1160},
  {"field_key":"id_document_type","label":"ID document type","field_type":"select","field_group":"financial","options":["Passport","Driver licence","Medicare","Other"],"visibility":"admin","member_editable":false,"sort_order":1170},
  {"field_key":"id_document_number","label":"ID document number","field_type":"text","field_group":"financial","visibility":"admin","member_editable":false,"is_sensitive":true,"sort_order":1180},

  {"field_key":"email_opt_in","label":"Email updates","field_type":"toggle","field_group":"communications","sort_order":1200},
  {"field_key":"sms_opt_in","label":"SMS updates","help_text":"Needed later for SMS campaigns.","field_type":"toggle","field_group":"communications","sort_order":1210},
  {"field_key":"mail_opt_in","label":"Postal mail updates","field_type":"toggle","field_group":"communications","sort_order":1220},
  {"field_key":"facebook","label":"Facebook / social profile","field_type":"text","field_group":"communications","sort_order":1230},
  {"field_key":"referred_by","label":"Referred by","field_type":"text","field_group":"communications","sort_order":1240},

  {"field_key":"date_joined_association","label":"Date joined Association","field_type":"date","field_group":"committee","visibility":"admin","member_editable":false,"sort_order":1300},
  {"field_key":"association_status","label":"Association status","field_type":"select","field_group":"committee","options":["Active","Pending","Lapsed"],"visibility":"admin","member_editable":false,"sort_order":1310},
  {"field_key":"visa_status","label":"Visa / residency status","field_type":"select","field_group":"committee","options":["Australian citizen","Permanent resident","Temporary visa","Other"],"visibility":"admin","member_editable":false,"sort_order":1320},
  {"field_key":"risk_flag","label":"Committee risk flag","field_type":"toggle","field_group":"committee","visibility":"admin","member_editable":false,"sort_order":1330},
  {"field_key":"committee_notes","label":"Committee notes","field_type":"textarea","field_group":"committee","visibility":"admin","member_editable":false,"sort_order":1340},
  {"field_key":"membership_officer_notes","label":"Membership officer notes","field_type":"textarea","field_group":"committee","visibility":"admin","member_editable":false,"sort_order":1350},
  {"field_key":"medical_notes","label":"Medical notes","field_type":"textarea","field_group":"committee","visibility":"admin","member_editable":false,"is_sensitive":true,"sort_order":1360},
  {"field_key":"hardship_history_notes","label":"Hardship history notes","field_type":"textarea","field_group":"committee","visibility":"admin","member_editable":false,"is_sensitive":true,"sort_order":1370},
  {"field_key":"funeral_cover_notes","label":"Funeral / bereavement notes","field_type":"textarea","field_group":"committee","visibility":"admin","member_editable":false,"sort_order":1380},
  {"field_key":"cultural_notes","label":"Cultural notes","field_type":"textarea","field_group":"committee","visibility":"admin","member_editable":false,"sort_order":1390}
]
$crm_seed$::jsonb) as x
on conflict (field_key) do nothing;
