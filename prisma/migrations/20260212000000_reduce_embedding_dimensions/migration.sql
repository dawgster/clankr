-- AlterTable: change intentEmbedding from vector(1536) to vector(384)
-- Existing embeddings are dropped because dimensions changed; they will be
-- regenerated on the next profile update.
ALTER TABLE "Profile"
  ALTER COLUMN "intentEmbedding" TYPE vector(384)
  USING NULL;
