import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ReputationController } from '../../../../src/modules/reputation/reputation.controller';
import { ReputationService } from '../../../../src/modules/reputation/reputation.service';

describe('ReputationController', () => {
  let controller: ReputationController;
  let reputationService: ReputationService;

  const mockReputationService = {
    getReputationScore: jest.fn(),
  };

  const validWallet = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';

  const mockReputationResponse = {
    wallet: validWallet,
    score: 75,
    tier: 'silver' as const,
    interestRate: 8,
    maxCredit: 3000,
    lastUpdated: '2026-02-13T10:00:00.000Z',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReputationController],
      providers: [
        {
          provide: ReputationService,
          useValue: mockReputationService,
        },
      ],
    }).compile();

    controller = module.get<ReputationController>(ReputationController);
    reputationService = module.get<ReputationService>(ReputationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // GET /reputation/:wallet
  // ---------------------------------------------------------------------------
  describe('getReputation', () => {
    it('should return reputation data wrapped in response envelope', async () => {
      mockReputationService.getReputationScore.mockResolvedValue(mockReputationResponse);

      const result = await controller.getReputation(validWallet);

      expect(result).toEqual({
        success: true,
        data: mockReputationResponse,
        message: 'Reputation score retrieved successfully',
      });
      expect(reputationService.getReputationScore).toHaveBeenCalledWith(validWallet);
      expect(reputationService.getReputationScore).toHaveBeenCalledTimes(1);
    });

    it('should throw BadRequestException for invalid wallet format (too short)', async () => {
      await expect(controller.getReputation('GABC')).rejects.toThrow(
        BadRequestException,
      );
      expect(reputationService.getReputationScore).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for wallet not starting with G', async () => {
      const badWallet = 'XABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';

      await expect(controller.getReputation(badWallet)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException with VALIDATION_INVALID_WALLET code', async () => {
      await expect(controller.getReputation('invalid')).rejects.toMatchObject({
        response: { code: 'VALIDATION_INVALID_WALLET' },
      });
    });

    it('should propagate service errors to the caller', async () => {
      mockReputationService.getReputationScore.mockRejectedValue(
        new Error('Contract read failed'),
      );

      await expect(controller.getReputation(validWallet)).rejects.toThrow(
        'Contract read failed',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // GET /reputation/me
  // ---------------------------------------------------------------------------
  describe('getMyReputation', () => {
    it('should throw UnauthorizedException since auth guard is not yet wired', async () => {
      await expect(controller.getMyReputation()).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
