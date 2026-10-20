-- CreateEnum
CREATE TYPE "resume_section_type" AS ENUM ('experience', 'education', 'skills', 'projects', 'certifications', 'awards', 'languages', 'custom');

-- CreateTable
CREATE TABLE "resumes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "template" VARCHAR(40) NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "idempotency_key" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "resumes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_basics" (
    "resume_id" UUID NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "headline" VARCHAR(160) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "phone" VARCHAR(40) NOT NULL,
    "location" VARCHAR(120) NOT NULL,
    "website" VARCHAR(300) NOT NULL,
    "linkedin" VARCHAR(300) NOT NULL,
    "github" VARCHAR(300) NOT NULL,
    "summary" TEXT NOT NULL,

    CONSTRAINT "resume_basics_pkey" PRIMARY KEY ("resume_id")
);

-- CreateTable
CREATE TABLE "resume_sections" (
    "id" UUID NOT NULL,
    "resume_id" UUID NOT NULL,
    "type" "resume_section_type" NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "position" INTEGER NOT NULL,
    "visible" BOOLEAN NOT NULL,

    CONSTRAINT "resume_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_entries" (
    "id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "visible" BOOLEAN NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "resume_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_resumes_user_updated" ON "resumes"("user_id", "updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_resumes_user_idempotency_key" ON "resumes"("user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "idx_resume_sections_resume_position" ON "resume_sections"("resume_id", "position");

-- CreateIndex
CREATE INDEX "idx_resume_entries_section_position" ON "resume_entries"("section_id", "position");

-- AddForeignKey
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_basics" ADD CONSTRAINT "resume_basics_resume_id_fkey" FOREIGN KEY ("resume_id") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_sections" ADD CONSTRAINT "resume_sections_resume_id_fkey" FOREIGN KEY ("resume_id") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_entries" ADD CONSTRAINT "resume_entries_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "resume_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: cheap guards the schema can't express.
ALTER TABLE "resumes" ADD CONSTRAINT "ck_resumes_revision_positive" CHECK ("revision" >= 1);
ALTER TABLE "resumes" ADD CONSTRAINT "ck_resumes_schema_version_positive" CHECK ("schema_version" >= 1);
ALTER TABLE "resume_entries" ADD CONSTRAINT "ck_resume_entries_data_object" CHECK (jsonb_typeof("data") = 'object');
