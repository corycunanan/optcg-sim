CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "users_username_trgm_idx"
  ON "users" USING GIN ("username" gin_trgm_ops);

CREATE INDEX "cards_name_trgm_idx"
  ON "cards" USING GIN ("name" gin_trgm_ops);
