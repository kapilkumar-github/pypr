-- CreateEnum
CREATE TYPE "app_theme" AS ENUM ('dark', 'light', 'system');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "app_accent_color" CHAR(7),
ADD COLUMN     "theme_preference" "app_theme";

-- Hand-written: CHECK constraints are not expressible in schema.prisma.
ALTER TABLE "users" ADD CONSTRAINT "ck_users_app_accent_color_hex" CHECK ("app_accent_color" ~ '^#[0-9A-F]{6}$');
