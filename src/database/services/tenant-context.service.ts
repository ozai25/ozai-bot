import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { TenantsService } from '../../modules/core/tenants/tenants.service';
import { LoggerService } from '../../observability/logger.service';

@Injectable()
export class TenantContextService {
  private readonly ALLOWED_SCHEMAS = ['sg01', 'fp02', 'oz01'];

  constructor(
    private readonly dataSource: DataSource,
    private readonly tenantsService: TenantsService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Execute database operation in tenant-specific schema
   * Handles: connection, transaction, schema switching, error handling, cleanup
   */
  async executeInTenantSchema<T>(
    tenantSlug: string,
    operation: (
      queryRunner: QueryRunner,
      tenant: { slug: string; schemaName: string },
    ) => Promise<T>,
  ): Promise<T> {
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      // Resolve tenant
      const tenant = await this.tenantsService.findBySlug(tenantSlug);
      if (!tenant) {
        throw new NotFoundException(`Tenant ${tenantSlug} not found`);
      }

      // CRITICAL: Validate schema against whitelist (prevents SQL injection)
      if (!this.ALLOWED_SCHEMAS.includes(tenant.schemaName)) {
        this.logger.error(
          `Invalid schema detected: ${tenant.schemaName} for tenant ${tenantSlug}`,
          '',
          'TenantContextService',
        );
        throw new InternalServerErrorException('Invalid tenant configuration');
      }

      // Set PostgreSQL search_path to tenant schema
      await queryRunner.query(
        `SET search_path TO ${tenant.schemaName}, core`,
      );

      this.logger.debug(
        `Executing operation in schema: ${tenant.schemaName}`,
        'TenantContextService',
      );

      const result = await operation(queryRunner, {
        slug: tenant.slug,
        schemaName: tenant.schemaName,
      });

      await queryRunner.commitTransaction();

      this.logger.debug(
        `Transaction committed for tenant: ${tenantSlug}`,
        'TenantContextService',
      );

      return result;
    } catch (error: any) {
      await queryRunner.rollbackTransaction();

      this.logger.error(
        `Transaction failed for tenant ${tenantSlug}: ${error.message}`,
        error.stack,
        'TenantContextService',
      );

      if (
        error instanceof NotFoundException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      if (error.code === '23505') {
        throw new InternalServerErrorException('Resource already exists');
      }

      if (error.code === '23503') {
        throw new InternalServerErrorException('Invalid reference');
      }

      throw new InternalServerErrorException('Database operation failed');
    } finally {
      await queryRunner.release();

      this.logger.debug(
        'QueryRunner released',
        'TenantContextService',
      );
    }
  }

  // >>> ADD START: Repository helpers (ADD ONLY) >>>
  async getTenantQueryRunner(
    tenantSlug: string,
  ): Promise<{
    queryRunner: QueryRunner;
    tenant: { slug: string; schemaName: string };
  }> {
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();

      const tenant = await this.tenantsService.findBySlug(tenantSlug);
      if (!tenant) {
        throw new NotFoundException(`Tenant ${tenantSlug} not found`);
      }

      if (!this.ALLOWED_SCHEMAS.includes(tenant.schemaName)) {
        this.logger.error(
          `Invalid schema detected: ${tenant.schemaName} for tenant ${tenantSlug}`,
          '',
          'TenantContextService',
        );
        throw new InternalServerErrorException('Invalid tenant configuration');
      }

      await queryRunner.query(`SET search_path TO ${tenant.schemaName}, core`);

      return {
        queryRunner,
        tenant: { slug: tenant.slug, schemaName: tenant.schemaName },
      };
    } catch (error: any) {
      try {
        await queryRunner.release();
      } catch {}
      throw error;
    }
  }

  async setTenantContext(tenantSlug: string): Promise<void> {
    const { queryRunner } = await this.getTenantQueryRunner(tenantSlug);
    try {
      return;
    } finally {
      await queryRunner.release();
    }
  }
  // <<< ADD END <<<
}
