INSERT INTO categories (id, parent_id, name, code, sort_order, is_system, flow_direction) VALUES
  (gen_random_uuid(), 'c0000000-0000-0000-0000-000000000003', 'Insurance', 'outflows_insurance', 345, false, 'outflow'),
  (gen_random_uuid(), 'c0000000-0000-0000-0000-000000000004', 'Paul Smith Loan', 'loans_paul_smith', 410, false, 'outflow'),
  (gen_random_uuid(), 'c0000000-0000-0000-0000-000000000004', 'People''s Choice', 'loans_peoples_choice', 420, false, 'outflow');
