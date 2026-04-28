CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE portal_links
  ADD COLUMN IF NOT EXISTS project_context_text text;

CREATE TABLE IF NOT EXISTS portal_link_context_files (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_link_id  uuid NOT NULL REFERENCES portal_links(id) ON DELETE CASCADE,
  uploaded_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name            text NOT NULL,
  mime_type       text NOT NULL,
  size_bytes      bigint NOT NULL DEFAULT 0,
  storage_path    text NOT NULL,
  extracted_text  text,
  indexing_status text NOT NULL DEFAULT 'pending' CHECK (indexing_status IN ('pending', 'processing', 'completed', 'failed')),
  chunks_count    integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portal_link_context_chunks (
  id             bigserial PRIMARY KEY,
  portal_link_id uuid NOT NULL REFERENCES portal_links(id) ON DELETE CASCADE,
  file_id        uuid REFERENCES portal_link_context_files(id) ON DELETE CASCADE,
  source_type    text NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'file')),
  chunk_index    integer NOT NULL,
  chunk_content  text NOT NULL,
  embedding      vector(1536) NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS portal_link_context_chunks_unique_idx
  ON portal_link_context_chunks (portal_link_id, source_type, COALESCE(file_id, '00000000-0000-0000-0000-000000000000'::uuid), chunk_index);

CREATE INDEX IF NOT EXISTS portal_link_context_files_portal_idx
  ON portal_link_context_files (portal_link_id, created_at DESC);

CREATE INDEX IF NOT EXISTS portal_link_context_chunks_portal_idx
  ON portal_link_context_chunks (portal_link_id);

CREATE INDEX IF NOT EXISTS portal_link_context_chunks_file_idx
  ON portal_link_context_chunks (file_id);

CREATE INDEX IF NOT EXISTS portal_link_context_chunks_embedding_idx
  ON portal_link_context_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

ALTER TABLE portal_link_context_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_link_context_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company members can manage portal link context files" ON portal_link_context_files;
CREATE POLICY "company members can manage portal link context files"
  ON portal_link_context_files FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM portal_links pl
      JOIN company_members cm ON cm.company_id = pl.company_id
      WHERE pl.id = portal_link_context_files.portal_link_id
        AND cm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM portal_links pl
      JOIN company_members cm ON cm.company_id = pl.company_id
      WHERE pl.id = portal_link_context_files.portal_link_id
        AND cm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "company members can read portal link context chunks" ON portal_link_context_chunks;
CREATE POLICY "company members can read portal link context chunks"
  ON portal_link_context_chunks FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM portal_links pl
      JOIN company_members cm ON cm.company_id = pl.company_id
      WHERE pl.id = portal_link_context_chunks.portal_link_id
        AND cm.user_id = auth.uid()
    )
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'portal-link-context',
  'portal-link-context',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "company members can upload portal link context files" ON storage.objects;
CREATE POLICY "company members can upload portal link context files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'portal-link-context'
    AND EXISTS (
      SELECT 1
      FROM company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = ((storage.foldername(name))[1])::uuid
    )
  );

DROP POLICY IF EXISTS "company members can delete portal link context files" ON storage.objects;
CREATE POLICY "company members can delete portal link context files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'portal-link-context'
    AND EXISTS (
      SELECT 1
      FROM company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = ((storage.foldername(name))[1])::uuid
    )
  );

CREATE OR REPLACE FUNCTION match_portal_link_context(
  query_embedding vector(1536),
  match_threshold float,
  match_count integer,
  filter_portal_link_id uuid
)
RETURNS TABLE (
  id bigint,
  chunk_content text,
  similarity float,
  source_type text,
  file_id uuid
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    plc.id,
    plc.chunk_content,
    1 - (plc.embedding <=> query_embedding) AS similarity,
    plc.source_type,
    plc.file_id
  FROM portal_link_context_chunks plc
  WHERE plc.portal_link_id = filter_portal_link_id
    AND 1 - (plc.embedding <=> query_embedding) >= match_threshold
  ORDER BY plc.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION match_portal_link_context(vector(1536), float, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION match_portal_link_context(vector(1536), float, integer, uuid) TO service_role;
