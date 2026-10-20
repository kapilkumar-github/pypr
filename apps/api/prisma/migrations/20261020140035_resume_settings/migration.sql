-- CreateEnum
CREATE TYPE "resume_density" AS ENUM ('compact', 'normal', 'spaced');

-- AlterTable
ALTER TABLE "resumes" ADD COLUMN     "accent_color" CHAR(7) NOT NULL DEFAULT '#B7FF3C',
ADD COLUMN     "density" "resume_density" NOT NULL DEFAULT 'normal',
ADD COLUMN     "font" VARCHAR(40) NOT NULL DEFAULT 'helvetica';

-- Hand-written: the API stores accents as uppercase "#RRGGBB".
ALTER TABLE "resumes" ADD CONSTRAINT "ck_resumes_accent_color_hex" CHECK ("accent_color" ~ '^#[0-9A-F]{6}$');
