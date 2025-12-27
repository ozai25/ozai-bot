import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1766461707348 implements MigrationInterface {
    name = 'InitialSchema1766461707348'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // REQUIRED: uuid_generate_v4() defaults require uuid-ossp
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

        await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS core`);
        await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS sg01`);
        await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS fp02`);
        await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS oz01`);

        await queryRunner.query(`CREATE TABLE "conversations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "platform" character varying(50) NOT NULL, "platform_thread_id" character varying(255) NOT NULL, "user_identifier" character varying(255) NOT NULL, "status" character varying(50) NOT NULL DEFAULT 'active', "assigned_brain" character varying(100), "last_admin_interaction" TIMESTAMP WITH TIME ZONE, "last_activity" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(), "metadata" jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_898400e8baed1e7acf6dc13b781" UNIQUE ("platform_thread_id"), CONSTRAINT "PK_ee34f4f7ced4ec8681f26bf04ef" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "conversation_id" uuid NOT NULL, "role" character varying(20) NOT NULL, "content" text NOT NULL, "intent_classification" character varying(100), "metadata" jsonb, "timestamp" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_18325f38ae6de43878487eff986" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "core"."tenants" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "slug" character varying(50) NOT NULL, "name" character varying(255) NOT NULL, "schema_name" character varying(50) NOT NULL, "api_keys" jsonb, "config" jsonb, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_2310ecc5cb8be427097154b18fc" UNIQUE ("slug"), CONSTRAINT "PK_53be67a04681c66b87ee27c9321" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "core"."audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "request_id" character varying(128), "tenant_slug" character varying(32), "actor_type" character varying(32), "actor_id" character varying(255), "method" character varying(16), "path" character varying(1024), "status_code" integer, "duration_ms" integer, "ip" character varying(128), "user_agent" character varying(512), "metadata" jsonb, "error" character varying(1024), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_audit_logs_route" ON "core"."audit_logs" ("method", "path") `);
        await queryRunner.query(`CREATE INDEX "idx_audit_logs_actor" ON "core"."audit_logs" ("actor_type", "actor_id") `);
        await queryRunner.query(`CREATE INDEX "idx_audit_logs_tenant_slug" ON "core"."audit_logs" ("tenant_slug") `);
        await queryRunner.query(`CREATE INDEX "idx_audit_logs_request_id" ON "core"."audit_logs" ("request_id") `);
        await queryRunner.query(`CREATE INDEX "idx_audit_logs_created_at" ON "core"."audit_logs" ("created_at") `);
        await queryRunner.query(`ALTER TABLE "messages" ADD CONSTRAINT "FK_3bc55a7c3f9ed54b520bb5cfe23" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "messages" DROP CONSTRAINT "FK_3bc55a7c3f9ed54b520bb5cfe23"`);
        await queryRunner.query(`DROP INDEX "core"."idx_audit_logs_created_at"`);
        await queryRunner.query(`DROP INDEX "core"."idx_audit_logs_request_id"`);
        await queryRunner.query(`DROP INDEX "core"."idx_audit_logs_tenant_slug"`);
        await queryRunner.query(`DROP INDEX "core"."idx_audit_logs_actor"`);
        await queryRunner.query(`DROP INDEX "core"."idx_audit_logs_route"`);
        await queryRunner.query(`DROP TABLE "core"."audit_logs"`);
        await queryRunner.query(`DROP TABLE "core"."tenants"`);
        await queryRunner.query(`DROP TABLE "messages"`);
        await queryRunner.query(`DROP TABLE "conversations"`);
    }
}
