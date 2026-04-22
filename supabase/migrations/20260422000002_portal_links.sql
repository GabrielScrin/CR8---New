-- Portal links: direct ad-account-based shareable dashboards (separate from client_portals)
CREATE TABLE IF NOT EXISTS portal_links (
  id                            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                    uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by                    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  public_token                  text        UNIQUE NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  name                          text        NOT NULL DEFAULT 'Dashboard',
  client_name                   text,
  meta_ad_account_id            text        NOT NULL,
  meta_ad_account_name          text,
  instagram_business_account_id text,
  instagram_username            text,
  status                        text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at                    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_links_company_id_idx   ON portal_links(company_id);
CREATE INDEX IF NOT EXISTS portal_links_public_token_idx ON portal_links(public_token);
CREATE INDEX IF NOT EXISTS portal_links_created_by_idx   ON portal_links(created_by);

ALTER TABLE portal_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members can manage portal links"
  ON portal_links FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = portal_links.company_id
        AND cm.user_id = auth.uid()
    )
  );
