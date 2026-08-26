-- AlterTable
ALTER TABLE "AgentGrant" ADD COLUMN     "docs" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "sheets" TEXT NOT NULL DEFAULT 'none';
