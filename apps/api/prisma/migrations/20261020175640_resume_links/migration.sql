-- AlterEnum
ALTER TYPE "resume_section_type" ADD VALUE 'links';

-- AlterTable
ALTER TABLE "resume_basics" ALTER COLUMN "website" SET DEFAULT '',
ALTER COLUMN "linkedin" SET DEFAULT '',
ALTER COLUMN "github" SET DEFAULT '';
