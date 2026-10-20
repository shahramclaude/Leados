-- LEADOS seed data.
--
-- Run with `npm run db:seed` (scripts/seed.mjs executes this file against
-- DATABASE_URL). Idempotent: safe to run multiple times because it matches
-- on natural keys (organization name, leader email) before inserting.
insert into organizations (name)
select 'Northwind Logistics'
where not exists (select 1 from organizations where name = 'Northwind Logistics');

insert into organizations (name)
select 'Helio Robotics'
where not exists (select 1 from organizations where name = 'Helio Robotics');

insert into leaders (organization_id, name, role, email, readiness_score, readiness_band)
select o.id, 'Amara Okafor', 'VP Operations', 'amara.okafor@northwind.example', '78', 'ready'
from organizations o
where o.name = 'Northwind Logistics'
  and not exists (select 1 from leaders where email = 'amara.okafor@northwind.example');

insert into leaders (organization_id, name, role, email, readiness_score, readiness_band)
select o.id, 'Jonas Reyes', 'Engineering Director', 'jonas.reyes@heliorobotics.example', '54', 'developing'
from organizations o
where o.name = 'Helio Robotics'
  and not exists (select 1 from leaders where email = 'jonas.reyes@heliorobotics.example');

insert into event_log (event_type, event_version, payload)
select 'seed.applied', '1', jsonb_build_object('source', 'scripts/seed.sql')
where not exists (select 1 from event_log where event_type = 'seed.applied');
