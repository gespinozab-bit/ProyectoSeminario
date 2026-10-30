-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "publication_status" AS ENUM ('DRAFT', 'PUBLISHED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "media_type" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "audit_action" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'PUBLISH', 'DEACTIVATE', 'ASSIGN', 'REVOKE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "password_hash" VARCHAR(255),
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(255),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(255),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "assigned_by_id" UUID,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "educational_modules" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "status" "publication_status" NOT NULL DEFAULT 'DRAFT',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "educational_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "educational_contents" (
    "id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "slug" VARCHAR(150) NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "summary" VARCHAR(500),
    "body" JSONB,
    "learning_objective" VARCHAR(500),
    "status" "publication_status" NOT NULL DEFAULT 'DRAFT',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "educational_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "content_id" UUID NOT NULL,
    "type" "media_type" NOT NULL,
    "url" TEXT NOT NULL,
    "storage_key" VARCHAR(500),
    "mime_type" VARCHAR(100) NOT NULL,
    "title" VARCHAR(180),
    "alt_text" VARCHAR(300),
    "caption" VARCHAR(500),
    "thumbnail_url" TEXT,
    "duration_seconds" INTEGER,
    "size_bytes" BIGINT,
    "status" "publication_status" NOT NULL DEFAULT 'DRAFT',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actor_id" UUID,
    "action" "audit_action" NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" VARCHAR(100) NOT NULL,
    "before_data" JSONB,
    "after_data" JSONB,
    "metadata" JSONB,
    "request_id" VARCHAR(100),
    "ip_address" INET,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE INDEX "user_roles_assigned_by_id_idx" ON "user_roles"("assigned_by_id");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "educational_modules_code_key" ON "educational_modules"("code");

-- CreateIndex
CREATE UNIQUE INDEX "educational_modules_slug_key" ON "educational_modules"("slug");

-- CreateIndex
CREATE INDEX "educational_modules_status_sort_order_idx" ON "educational_modules"("status", "sort_order");

-- CreateIndex
CREATE INDEX "educational_contents_status_published_at_idx" ON "educational_contents"("status", "published_at");

-- CreateIndex
CREATE INDEX "educational_contents_created_by_id_idx" ON "educational_contents"("created_by_id");

-- CreateIndex
CREATE INDEX "educational_contents_updated_by_id_idx" ON "educational_contents"("updated_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "educational_contents_module_id_slug_key" ON "educational_contents"("module_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "educational_contents_module_id_sort_order_key" ON "educational_contents"("module_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_storage_key_key" ON "media_assets"("storage_key");

-- CreateIndex
CREATE INDEX "media_assets_content_id_type_status_idx" ON "media_assets"("content_id", "type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_content_id_sort_order_key" ON "media_assets"("content_id", "sort_order");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educational_contents" ADD CONSTRAINT "educational_contents_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "educational_modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educational_contents" ADD CONSTRAINT "educational_contents_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educational_contents" ADD CONSTRAINT "educational_contents_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "educational_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Domain constraints not expressible in the Prisma schema language.
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_normalized_check"
  CHECK ("email" = LOWER(BTRIM("email")) AND "email" LIKE '%_@_%._%'),
  ADD CONSTRAINT "users_names_not_blank_check"
  CHECK (BTRIM("first_name") <> '' AND BTRIM("last_name") <> '');

ALTER TABLE "roles"
  ADD CONSTRAINT "roles_code_not_blank_check" CHECK (BTRIM("code") <> ''),
  ADD CONSTRAINT "roles_name_not_blank_check" CHECK (BTRIM("name") <> '');

ALTER TABLE "permissions"
  ADD CONSTRAINT "permissions_code_not_blank_check" CHECK (BTRIM("code") <> ''),
  ADD CONSTRAINT "permissions_name_not_blank_check" CHECK (BTRIM("name") <> '');

ALTER TABLE "educational_modules"
  ADD CONSTRAINT "educational_modules_identity_not_blank_check"
  CHECK (BTRIM("code") <> '' AND BTRIM("slug") <> '' AND BTRIM("title") <> ''),
  ADD CONSTRAINT "educational_modules_sort_order_check" CHECK ("sort_order" >= 0);

ALTER TABLE "educational_contents"
  ADD CONSTRAINT "educational_contents_identity_not_blank_check"
  CHECK (BTRIM("slug") <> '' AND BTRIM("title") <> ''),
  ADD CONSTRAINT "educational_contents_sort_order_check" CHECK ("sort_order" >= 0),
  ADD CONSTRAINT "educational_contents_publication_check"
  CHECK ("status" <> 'PUBLISHED' OR "published_at" IS NOT NULL);

ALTER TABLE "media_assets"
  ADD CONSTRAINT "media_assets_url_not_blank_check" CHECK (BTRIM("url") <> ''),
  ADD CONSTRAINT "media_assets_mime_type_not_blank_check" CHECK (BTRIM("mime_type") <> ''),
  ADD CONSTRAINT "media_assets_sort_order_check" CHECK ("sort_order" >= 0),
  ADD CONSTRAINT "media_assets_duration_check" CHECK ("duration_seconds" IS NULL OR "duration_seconds" >= 0),
  ADD CONSTRAINT "media_assets_size_check" CHECK ("size_bytes" IS NULL OR "size_bytes" >= 0);

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_entity_not_blank_check"
  CHECK (BTRIM("entity_type") <> '' AND BTRIM("entity_id") <> '');
