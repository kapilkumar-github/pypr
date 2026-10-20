-- CreateTable
CREATE TABLE "resume_photos" (
    "resume_id" UUID NOT NULL,
    "content_type" VARCHAR(40) NOT NULL,
    "data" BYTEA NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "resume_photos_pkey" PRIMARY KEY ("resume_id")
);

-- AddForeignKey
ALTER TABLE "resume_photos" ADD CONSTRAINT "resume_photos_resume_id_fkey" FOREIGN KEY ("resume_id") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: CHECK constraints are not expressible in schema.prisma.
-- Only JPEGs the API encoded itself, at most 800 px and 2 MB.
ALTER TABLE "resume_photos" ADD CONSTRAINT "ck_resume_photos_content_type" CHECK ("content_type" = 'image/jpeg');
ALTER TABLE "resume_photos" ADD CONSTRAINT "ck_resume_photos_size" CHECK ("width" BETWEEN 1 AND 800 AND "height" BETWEEN 1 AND 800 AND octet_length("data") <= 2097152);
