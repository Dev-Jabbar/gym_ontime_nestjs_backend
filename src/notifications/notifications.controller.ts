import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

// Mounted at /api/notifications. All three routes just need a valid
// login (protect() with no roles in Express) — no RolesGuard needed here,
// unlike AdminProfileController/ClassesController's admin-gated routes.
//
// No segment-count collision risk between 'mark-all-read' (1 segment)
// and ':id/read' (2 segments) — same non-issue as the by-member/
// member-count routes in ClassesController, not the real /me-vs-/:id
// hazard from Step 1.5. Declared in the same order as Express anyway,
// for readability.
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // GET /api/notifications/my-notifications
  @Get('my-notifications')
  async getMyNotifications(@CurrentUser() user: any) {
    const data = await this.notificationsService.getMyNotifications(user.id);
    return { success: true, data };
  }

  // PUT /api/notifications/:id/read
  @Put(':id/read')
  async markAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    const updated = await this.notificationsService.markNotificationAsRead(id, user.id);
    if (!updated) throw new NotFoundException('Notification not found');
    return { success: true, data: updated };
  }

  // PUT /api/notifications/mark-all-read
  @Put('mark-all-read')
  async markAllAsRead(@CurrentUser() user: any) {
    await this.notificationsService.markAllNotificationsAsRead(user.id);
    return { success: true, message: 'All notifications marked as read' };
  }
}
