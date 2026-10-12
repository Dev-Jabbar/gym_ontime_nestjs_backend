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

// Mounted at /api/payments (matches Express's app.use("/api/payments", ...)).
// Route declaration order kept identical to payment.route.ts: webhook,
// initiate, verify, my-payments, class/:classId, / (all), /:id. The last
// three are the real ordering hazard here — verify/my-payments/class/:classId
// all have to come before the bare :id route, same reasoning as every
// other module's /me-vs-/:id hazard, just with three specific routes
// instead of one.
//
// Every method below deliberately returns/throws the SAME
// {success, message, data?} envelope Express used, rather than relying on
// Nest's default {statusCode, message, error} exception shape the way
// every other controller in this app does. This is a genuine, necessary
// deviation from the established pattern: checked against the real
// frontend (useBooking.ts, payment-success/page.tsx) and confirmed both
// files read result.success/result.message/result.data explicitly on
// BOTH the success and failure paths — not just response.ok. Nest's
// default exception JSON would silently break that frontend code.
// HttpException's constructor accepts a custom body as its first
// argument, which is what makes this possible without abandoning Nest's
// exception mechanism entirely.
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // POST /api/payments/webhook — PUBLIC, no guard, matches Express.
  //
  // The HMAC is computed over req.rawBody (the exact bytes Paystack sent,
  // kept by `rawBody: true` in main.ts), NOT JSON.stringify(req.body).
  // @Req() is used instead of a DTO @Body() so the ValidationPipe never
  // touches the payload.
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
        // Keep the real status (e.g. 401 for a bad signature).
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

  // POST /api/payments/initiate — member only.
  @Post('initiate')
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

  // GET /api/payments/verify?reference=xxx — member only.
  @Get('verify')
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

  // GET /api/payments/my-payments — member only.
  @Get('my-payments')
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

  // GET /api/payments/class/:classId — admin only (financial data;
  // trainers should NOT see payment amounts, same note as Express).
  @Get('class/:classId')
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

  // GET /api/payments — admin only.
  @Get()
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

  // GET /api/payments/:id — admin only. Declared LAST, same ordering
  // hazard reasoning as every other module's bare :id route.
  @Get(':id')
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
