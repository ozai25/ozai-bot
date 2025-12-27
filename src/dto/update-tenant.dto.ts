// src/dto/update-tenant.dto.ts
export class UpdateTenantDto {
  /**
   * Human name for display/admin screens.
   */
  name?: string;

  /**
   * Whether this tenant is active. Inactive tenants should be blocked by guards.
   */
  isActive?: boolean;

  /**
   * Optional operational notes for internal admins.
   */
  notes?: string;
}
