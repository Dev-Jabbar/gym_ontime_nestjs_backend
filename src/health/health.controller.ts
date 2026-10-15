import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HealthService } from './health.service.js';

// PUBLIC on purpose (no guards): load balancers, Docker and Kubernetes
// probes have no login. It exposes only up/down and timings, never
// connection strings or error messages.
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  // 200 when the API can serve requests (ok or degraded), 503 when the
  // database is down, so a probe can tell "restart me" from "all good".
  @Get()
  async check() {
    const report = await this.health.check();
    if (report.status === 'error') {
      throw new ServiceUnavailableException(report);
    }
    return report;
  }
}
