-- Phase 3a: team_members upsert (match by lower(email))
DO $$
DECLARE r RECORD; v_id uuid;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('8bc72d56-9866-4cd3-b5c7-fa46fd2ded39'::uuid,'AV','Avinash Vaswani','Mixed','avaswani@alvas.co'),
      ('7da38bb0-1c54-4be5-a24b-47db3933503b'::uuid,'AS','Ayoub Suttle','Sales','ayoubsuttle@gmail.com'),
      ('cea43005-2200-463e-8c04-916af4e06295'::uuid,'CB','Crystal Brathwaite','Sales','cbrathwaite@alvas.co'),
      ('1e75f83f-8671-47bd-94b1-45a3e848d549'::uuid,'NJ','Nakish Joseph','Finance','njoseph@alvas.co'),
      ('b0a04cde-ebe7-4fbc-bb83-894daad05ef0'::uuid,'SL','Susie Lin','Production','procurement@alvas.co'),
      ('d12f502f-dac1-4184-9940-968e9f4669a3'::uuid,'TS','Teshima Scantlebury','Mixed','tscantlebury@alvas.co'),
      ('95d171c8-56d3-4bf1-9438-230ed5fcc64a'::uuid,'TB','Tia Beckles','Production','design@alvas.co'),
      ('a865d8b7-b5a6-43a2-9e87-d9e8caac665a'::uuid,'NL','Nathaniel Leon','Production','nleon@alvas.co')
    ) AS t(id, initials, full_name, role, email)
  LOOP
    SELECT id INTO v_id FROM team_members WHERE LOWER(email)=LOWER(r.email) LIMIT 1;
    IF v_id IS NOT NULL THEN
      UPDATE team_members SET full_name=r.full_name, role=r.role WHERE id=v_id;
    ELSE
      INSERT INTO team_members (id, initials, full_name, role, email)
      VALUES (r.id, r.initials, r.full_name, r.role, r.email);
    END IF;
  END LOOP;
END $$;

-- Phase 5a: buyers from contact_person
INSERT INTO buyers (customer_id, name)
SELECT DISTINCT c.id, TRIM(p.contact_person)
FROM projects p
JOIN customers c ON LOWER(TRIM(c.name)) = LOWER(TRIM(p.customer))
WHERE p.contact_person IS NOT NULL AND TRIM(p.contact_person) <> '';

-- Phase 5b: link projects.buyer_id
UPDATE projects p
SET buyer_id = b.id
FROM buyers b, customers c
WHERE LOWER(TRIM(c.name)) = LOWER(TRIM(p.customer))
  AND b.customer_id = c.id
  AND LOWER(TRIM(b.name)) = LOWER(TRIM(p.contact_person))
  AND p.contact_person IS NOT NULL AND TRIM(p.contact_person) <> '';

-- Phase 5c: tracking_ref → shipment_number for FCL/LCL/AIR patterns
UPDATE projects
SET shipment_number = tracking_ref, tracking_ref = NULL
WHERE tracking_ref ~ '^(FCL|LCL|AIR)-\d+';

-- Phase 5d: cbm → volume_value
UPDATE projects SET volume_value = cbm, volume_unit = 'CBM'
WHERE cbm IS NOT NULL;

-- Phase 5e: summary audit log
INSERT INTO project_log_entries (id, project_id, ts, actor_user_id,
  actor_display_name, action_type, description, metadata)
SELECT
  'log-import-' || substr(md5(random()::text),1,12),
  (SELECT id FROM projects ORDER BY created_at LIMIT 1),
  now(), 'system', 'System', 'field_edit',
  'System imported v2-1 data (' || (SELECT COUNT(*) FROM customers) || ' customers, '
    || (SELECT COUNT(*) FROM suppliers) || ' suppliers, '
    || (SELECT COUNT(*) FROM projects) || ' projects, '
    || (SELECT COUNT(*) FROM buyers) || ' buyers from contact_person, '
    || ((SELECT COUNT(*) FROM project_log_entries)) || ' audit entries)',
  jsonb_build_object('import_source','v2-1','import_date', now()::text);