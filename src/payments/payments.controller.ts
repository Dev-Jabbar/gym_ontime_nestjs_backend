import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { PaymentsService } from './payments.service.js';
import { InitiatePaymentDto } from './dto/initiate-payment.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

// Mounted at /api/payments.
//
// Route order matters: `verify`, `my-payments` and `class/:classId` must be
// declared before the bare `:id` route, and the bare `:id` route stays last.
//
// Unlike the other controllers, every method returns or throws a
// `{ success, message, data? }` envelope instead of Nest's default exception
// shape (`{ statusCode, message, error }`). The frontend (useBooking.ts and
// the payment-success page) reads `result.success`, `result.message` and
// `result.data` on both the success and the failure path, so the default
// shape would break it. HttpException accepts a custom body as its first
// argument, which allows this without abandoning Nest's exception mechanism.
@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // POST /api/payments/webhook: public, no guard.
  //
  // The HMAC is computed over req.rawBody (the exact bytes Paystack sent,
  // kept by `rawBody: true` in bootstrap.ts), not JSON.stringify(req.body).
  // @Req() is used instead of a DTO @Body() so the ValidationPipe never
  // touches the payload.
  @ApiOperation({ summary: 'Paystack webhook (called by Paystack, signed with x-paystack-signature)' })
  @Post('webhook')
  async webhook(@Req() req: RawBodyRequest<Request>) {
    const signature = req.headers['x-paystack-signature'];
    if (typeof signature !== 'string' || !signature) {
      throw new HttpException(
        { success: false, message: 'No signature provided' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const rawBody = req.rawBody;
    if (!rawBody || rawBody.length === 0) {
      throw new HttpException(
        { success: false, message: 'Empty or unreadable request body' },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      await this.paymentsService.handlePaystackWebhook(signature, rawBody);
      return { success: true, message: 'Webhook processed' };
    } catch (err: any) {
      if (err instanceof HttpException) {
        // Keep the real status (for example 401 for a bad signature).
        throw new HttpException(
          { success: false, message: err.message },
          err.getStatus(),
        );
      }
      console.error('Webhook error:', err);
      throw new HttpException(
        { success: false, message: err.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // POST /api/payments/initiate: member only.
  @ApiOperation({ summary: 'Start a checkout: hold a seat and get the Paystack URL', description: 'Allowed roles: member.' })
  @Post('initiate')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('member')
  async initiate(@Body() dto: InitiatePaymentDto, @CurrentUser() user: any) {
    try {
      const result = await this.paymentsService.createCheckoutSession({
        userId: user.id,
        classId: dto.classId,
        paymentType: dto.paymentType,
        subscriptionInterval: dto.subscriptionInterval,
      });
      return {
        success: true,
        message: 'Checkout session created',
        data: result,
      };
    } catch (err: any) {
      throw new HttpException(
        {
          success: false,
          message: err.message || 'Payment initiation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // GET /api/payments/verify?reference=xxx: member only.
  @ApiOperation({ summary: 'Verify a payment by reference and enroll the member', description: 'Allowed roles: member.' })
  @Get('verify')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('member')
  async verify(@Query('reference') reference: string) {
    try {
      if (!reference) {
        throw new Error('Payment reference is required');
      }
      const result = await this.paymentsService.verifyPayment(reference);
      return { success: true, ...result };
    } catch (err: any) {
      throw new HttpException(
        {
          success: false,
          message: err.message || 'Payment verification failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // GET /api/payments/my-payments: member only.
  @ApiOperation({ summary: 'List my payments', description: 'Allowed roles: member.' })
  @Get('my-payments')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('member')
  async myPayments(@CurrentUser() user: any) {
    try {
      const payments = await this.paymentsService.getUserPayments(user.id);
      return { success: true, data: payments };
    } catch (err: any) {
      throw new HttpException(
        { success: false, message: err.message || 'Failed to fetch payments' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // GET /api/payments/class/:classId: admin only. Payment amounts are
  // financial data, so trainers must not see them.
  @ApiOperation({ summary: 'List the payments for a class', description: 'Allowed roles: admin.' })
  @Get('class/:classId')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async classPayments(@Param('classId', ParseUUIDPipe) classId: string) {
    try {
      const payments = await this.paymentsService.getClassPayments(classId);
      return { success: true, data: payments };
    } catch (err: any) {
      throw new HttpException(
        {
          success: false,
          message: err.message || 'Failed to fetch class payments',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // GET /api/payments: admin only.
  @ApiOperation({ summary: 'List all payments', description: 'Allowed roles: admin.' })
  @Get()
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async all() {
    try {
      const payments = await this.paymentsService.getAllPayments();
      return { success: true, data: payments };
    } catch (err: any) {
      throw new HttpException(
        { success: false, message: err.message || 'Failed to fetch payments' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // GET /api/payments/:id: admin only. Declared last because it would
  // otherwise capture the fixed paths above.
  @ApiOperation({ summary: 'Get one payment', description: 'Allowed roles: admin.' })
  @Get(':id')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async byId(@Param('id', ParseUUIDPipe) id: string) {
    try {
      const payment = await this.paymentsService.getPaymentById(id);
      return { success: true, data: payment };
    } catch (err: any) {
      throw new HttpException(
        { success: false, message: err.message || 'Failed to fetch payment' },
        HttpStatus.NOT_FOUND,
      );
    }
  }
}
