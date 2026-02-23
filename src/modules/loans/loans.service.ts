import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ReputationService } from '../reputation/reputation.service';
import { SupabaseService } from '../../database/supabase.client';
import { LoanQuoteRequestDto } from './dto/loan-quote-request.dto';
import { LoanQuoteResponseDto, SchedulePaymentDto } from './dto/loan-quote-response.dto';

/** Guarantee percentage of the total purchase amount */
const GUARANTEE_PERCENT = 0.2;

/** Loan percentage of the total purchase amount (1 - guarantee) */
const LOAN_PERCENT = 0.8;

@Injectable()
export class LoansService {
  private readonly logger = new Logger(LoansService.name);

  constructor(
    private readonly reputationService: ReputationService,
    private readonly supabaseService: SupabaseService,
  ) {}

  /**
   * Calculates a loan quote based on the user's reputation score and the
   * requested amount/term. No blockchain interaction — purely off-chain math.
   *
   * Steps:
   * 1. Fetch the user's reputation (score, tier, interest rate, max credit)
   * 2. Validate the merchant exists and is active
   * 3. Validate the amount is within the user's credit limit
   * 4. Calculate guarantee, loan amount, interest, and total repayment
   * 5. Generate a monthly repayment schedule
   *
   * @param wallet - Stellar wallet address of the borrower
   * @param dto    - Loan quote request (amount, merchant, term)
   */
  async calculateLoanQuote(
    wallet: string,
    dto: LoanQuoteRequestDto,
  ): Promise<LoanQuoteResponseDto> {
    // 1. Fetch reputation to determine interest rate and credit limit
    const reputation = await this.reputationService.getReputationScore(wallet);

    // 2. Validate merchant exists and is active
    await this.validateMerchant(dto.merchant);

    // 3. Validate amount against user's max credit
    if (dto.amount > reputation.maxCredit) {
      throw new BadRequestException({
        code: 'LOAN_AMOUNT_EXCEEDS_CREDIT',
        message: `Requested amount $${dto.amount} exceeds your maximum credit limit of $${reputation.maxCredit}. Improve your reputation score to unlock higher limits.`,
      });
    }

    // 4. Calculate loan breakdown
    const guarantee = Math.round(dto.amount * GUARANTEE_PERCENT * 100) / 100;
    const loanAmount = Math.round(dto.amount * LOAN_PERCENT * 100) / 100;
    const interestRate = reputation.interestRate;

    // Interest = principal × (rate/100) × (term/12)
    const interest = loanAmount * (interestRate / 100) * (dto.term / 12);
    const totalRepayment = Math.round((loanAmount + interest) * 100) / 100;

    // 5. Generate repayment schedule
    const schedule = this.generateSchedule(totalRepayment, dto.term);

    return {
      amount: dto.amount,
      guarantee,
      loanAmount,
      interestRate,
      totalRepayment,
      term: dto.term,
      schedule,
    };
  }

  /**
   * Validates that a merchant exists in the database and is currently active.
   * Throws NotFoundException if the merchant doesn't exist, or
   * BadRequestException if the merchant is inactive.
   */
  private async validateMerchant(merchantId: string): Promise<void> {
    const client = this.supabaseService.getServiceRoleClient();

    const { data: merchant, error } = await client
      .from('merchants')
      .select('id, name, is_active')
      .eq('id', merchantId)
      .single();

    if (error || !merchant) {
      throw new NotFoundException({
        code: 'MERCHANT_NOT_FOUND',
        message: 'Merchant not found. Please provide a valid merchant ID.',
      });
    }

    if (!merchant.is_active) {
      throw new BadRequestException({
        code: 'MERCHANT_INACTIVE',
        message: `Merchant "${merchant.name}" is not currently accepting new loans.`,
      });
    }
  }

  /**
   * Generates an equal-payment monthly repayment schedule.
   * The last payment absorbs any rounding remainder so the sum
   * of all payments equals totalRepayment exactly.
   *
   * @param totalRepayment - Total amount to be repaid
   * @param term           - Number of monthly payments
   */
  generateSchedule(totalRepayment: number, term: number): SchedulePaymentDto[] {
    const monthlyPayment = Math.floor((totalRepayment / term) * 100) / 100;
    const now = new Date();
    const schedule: SchedulePaymentDto[] = [];

    let allocated = 0;

    for (let i = 1; i <= term; i++) {
      const dueDate = new Date(now);
      dueDate.setMonth(dueDate.getMonth() + i);
      dueDate.setHours(0, 0, 0, 0);

      const isLast = i === term;
      const amount = isLast
        ? Math.round((totalRepayment - allocated) * 100) / 100
        : monthlyPayment;

      allocated += amount;

      schedule.push({
        paymentNumber: i,
        amount,
        dueDate: dueDate.toISOString(),
      });
    }

    return schedule;
  }
}
