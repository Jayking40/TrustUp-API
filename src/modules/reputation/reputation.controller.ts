import {
  Controller,
  Get,
  Param,
  BadRequestException,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ReputationService } from './reputation.service';
import { ReputationResponseDto } from './dto/reputation-response.dto';

/** Validates Stellar Ed25519 public key format (G + 55 base32 characters) */
const STELLAR_WALLET_REGEX = /^G[A-Z2-7]{55}$/;

@ApiTags('reputation')
@Controller('reputation')
export class ReputationController {
  constructor(private readonly reputationService: ReputationService) {}

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get authenticated user reputation score',
    description:
      'Returns the on-chain reputation score, tier, interest rate, and max credit for the currently authenticated user. Requires JWT authentication.',
  })
  @ApiResponse({
    status: 200,
    description: 'Reputation score retrieved successfully',
    type: ReputationResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid JWT' })
  async getMyReputation(): Promise<{ success: boolean; data: ReputationResponseDto; message: string }> {
    // Auth guard is not yet wired (API-03 dependency).
    // Once the JwtAuthGuard and @CurrentUser() decorator are implemented,
    // this endpoint will extract the wallet from the JWT payload.
    // For now, return a clear 401-style error so consumers know auth is required.
    throw new UnauthorizedException({
      code: 'AUTH_NOT_IMPLEMENTED',
      message:
        'Authentication guard is not yet available. Use GET /reputation/:wallet instead.',
    });
  }

  @Get(':wallet')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get reputation score for a wallet',
    description:
      'Queries the on-chain Reputation contract for the given wallet and returns a normalized score with tier, interest rate, and credit limit.',
  })
  @ApiParam({
    name: 'wallet',
    description: 'Stellar wallet address (Ed25519 public key, G + 55 chars)',
    example: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW',
  })
  @ApiResponse({
    status: 200,
    description: 'Reputation score retrieved successfully',
    type: ReputationResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid wallet address format' })
  @ApiResponse({ status: 500, description: 'Blockchain RPC error' })
  async getReputation(
    @Param('wallet') wallet: string,
  ): Promise<{ success: boolean; data: ReputationResponseDto; message: string }> {
    if (!STELLAR_WALLET_REGEX.test(wallet)) {
      throw new BadRequestException({
        code: 'VALIDATION_INVALID_WALLET',
        message:
          'Invalid Stellar wallet address. Must start with G and have 55 base32 characters [A-Z2-7].',
      });
    }

    const data = await this.reputationService.getReputationScore(wallet);
    return {
      success: true,
      data,
      message: 'Reputation score retrieved successfully',
    };
  }
}
