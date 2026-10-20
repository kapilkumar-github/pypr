-- CreateEnum
CREATE TYPE "user_token_purpose" AS ENUM ('verify_email');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verified_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "user_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" "user_token_purpose" NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_user_tokens_token_hash" ON "user_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "idx_user_tokens_user_purpose" ON "user_tokens"("user_id", "purpose");

-- AddForeignKey
ALTER TABLE "user_tokens" ADD CONSTRAINT "user_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: one-time tokens are stored only as hex SHA-256, never raw.
ALTER TABLE "user_tokens" ADD CONSTRAINT "ck_user_tokens_token_hash_hex" CHECK ("token_hash" ~ '^[0-9a-f]{64}$');
