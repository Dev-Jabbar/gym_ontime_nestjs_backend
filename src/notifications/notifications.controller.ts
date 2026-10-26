import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RegisterDeviceTokenDto, UnregisterDeviceTokenDto } from './dto/device-token.dto.js';

// Mounted at /api/notifications. Every route only needs a valid login, so
// there is no RolesGuard. `mark-all-read` (one segment) and `:id/read` (two
// segments) cannot collide, so declaration order is not significant.
@ApiTags('Notifications')
@Controller('notifications')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // GET /api/notifications/my-notifications
  @ApiOperation({ summary: 'List my notifications' })
  @Get('my-notifications')
  async getMyNotifications(@CurrentUser() user: any) {
    const data = await this.notificationsService.getMyNotifications(user.id);
    return { success: true, data };
  }

  // PUT /api/notifications/:id/read
  @ApiOperation({ summary: 'Mark one notification as read' })
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
  @ApiOperation({ summary: 'Mark all my notifications as read' })
  @Put('mark-all-read')
  async markAllAsRead(@CurrentUser() user: any) {
    await this.notificationsService.markAllNotificationsAsRead(user.id);
    return { success: true, message: 'All notifications marked as read' };
  }

  // POST /api/notifications/device-token  (register this browser for push)
  @ApiOperation({ summary: 'Register a push device token' })
  @Post('device-token')
  async registerDeviceToken(
    @Body() dto: RegisterDeviceTokenDto,
    @CurrentUser() user: any,
  ) {
    await this.notificationsService.registerDeviceToken(user.id, dto.token, dto.platform);
    return { success: true, message: 'Device registered for push notifications' };
  }

  // DELETE /api/notifications/device-token  (unregister, e.g. on logout)
  @ApiOperation({ summary: 'Remove a push device token' })
  @Delete('device-token')
  async unregisterDeviceToken(
    @Body() dto: UnregisterDeviceTokenDto,
    @CurrentUser() user: any,
  ) {
    await this.notificationsService.unregisterDeviceToken(user.id, dto.token);
    return { success: true, message: 'Device unregistered' };
  }
}
