import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { AdminGuard } from '../guards/admin.guard';

// ✅ ADD
import { AdminThrottlerGuard } from '../security/admin-throttler.guard';

// ✅ ADD
import { Throttle } from '@nestjs/throttler';

// ✅ ADD: env-driven values (decorator evaluated at load time)
const ADMIN_TTL = Number(process.env.RATE_LIMIT_ADMIN_TTL_SECONDS || 60);
const ADMIN_LIMIT = Number(process.env.RATE_LIMIT_ADMIN_MAX_REQUESTS || 100);

@Controller('admin/dashboard')
@UseGuards(AdminGuard, AdminThrottlerGuard)

// ✅ ADD: opt this controller into the named "admin" throttler lane
@Throttle({ admin: { ttl: ADMIN_TTL, limit: ADMIN_LIMIT } })
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('snapshot')
  async getSnapshot() {
    return this.dashboardService.getSystemSnapshot();
  }
}
