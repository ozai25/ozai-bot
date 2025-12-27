// src/repositories/tenant.repository.ts
import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { Tenant } from '../database/entities/core/tenant.entity';

@Injectable()
export class TenantRepository {
  private readonly repo: Repository<Tenant>;

  constructor(private readonly dataSource: DataSource) {
    this.repo = this.dataSource.getRepository(Tenant);
  }

  async findById(id: string): Promise<Tenant | null> {
    return this.repo.findOne({ where: { id } as any });
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    const normalized = String(slug ?? '').trim().toLowerCase();
    if (!normalized) return null;

    return this.repo.findOne({ where: { slug: normalized } as any });
  }

  async listActive(): Promise<Tenant[]> {
    // If your Tenant entity uses a different column name than `isActive`, this
    // is still safe: update the where clause later to match the entity.
    return this.repo.find({
      where: { isActive: true } as any,
      order: { slug: 'ASC' } as any,
    });
  }

  async save(tenant: Tenant): Promise<Tenant> {
    return this.repo.save(tenant);
  }
}
