-- Replace case-sensitive unique constraint with case-insensitive
ALTER TABLE pipeline_clients DROP CONSTRAINT IF EXISTS pipeline_clients_entity_id_name_key;
CREATE UNIQUE INDEX idx_pipeline_clients_entity_name_ci ON pipeline_clients (entity_id, lower(name));
