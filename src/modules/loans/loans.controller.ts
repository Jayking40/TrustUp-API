import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { LoansService } from './loans.service';
import { LoanQuoteRequestDto } from './dto/loan-quote-request.dto';
import { LoanQuoteResponseDto } from './dto/loan-quote-response.dto';

/** Validates Stellar Ed25519 public key format (G + 55 base32 characters) */
const STELLAR_WALLET_REGEX = /^G[A-Z2-7]{55}$/;

@ApiTags('loans')
@Controller('loans')
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiHeader({
    name: 'x-wallet-address',
    description:
      'Stellar wallet address (temporary — will be replaced by JWT auth once JwtAuthGuard is wired)',
    required: true,
    example: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW',
  })
  @ApiOperation({
    summary: 'Calculate loan quote',
    description:
      'Calculates loan terms (interest rate, repayment schedule, total cost) based on user reputation without creating an actual loan on-chain. Requires JWT authentication (currently uses x-wallet-address header until JwtAuthGuard is wired).',
  })
  @ApiResponse({
    status: 200,
    description: 'Loan quote calculated successfully',
    type: LoanQuoteResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input or amount exceeds credit limit' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid JWT' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async getLoanQuote(
    @Headers('x-wallet-address') wallet: string,
    @Body() dto: LoanQuoteRequestDto,
  ) {
    // TODO: Replace x-wallet-address header with @UseGuards(JwtAuthGuard) + @CurrentUser()
    // once API-03 (auth guards) is implemented.
    this.validateWallet(wallet);

    const data = await this.loansService.calculateLoanQuote(wallet, dto);
    return { success: true, data, message: 'Loan quote calculated successfully' };
  }

  /**
   * Validates the wallet address format.
   * Temporary — will be removed once JwtAuthGuard extracts the wallet from JWT.
   */
  private validateWallet(wallet: string): void {
    if (!wallet || !STELLAR_WALLET_REGEX.test(wallet)) {
      throw new BadRequestException({
        code: 'VALIDATION_INVALID_WALLET',
        message:
          'Invalid or missing wallet address. Provide a valid Stellar wallet in the x-wallet-address header.',
      });
    }
  }
}
