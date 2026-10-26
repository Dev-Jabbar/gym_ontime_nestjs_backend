import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service.js';

// Global, so any repository can inject CacheService without its module
// importing this one (as with PrismaModule).
@Global()
@Module({
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
