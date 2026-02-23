import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { LoansModule } from '../../../../src/modules/loans/loans.module';
import { ReputationService } from '../../../../src/modules/reputation/reputation.service';
import { ReputationContractClient } from '../../../../src/blockchain/contracts/reputation-contract.client';
import { SorobanService } from '../../../../src/blockchain/soroban/soroban.service';
import { SupabaseService } from '../../../../src/database/supabase.client';

describe('LoansController (e2e)', () => {
  let app: NestFastifyApplication;

  const validWallet = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';
  const merchantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  const mockReputationContract = {
    getScore: jest.fn().mockResolvedValue(75),
  };

  const mockSorobanService = {
    simulateContractCall: jest.fn(),
    getServer: jest.fn(),
    getNetworkPassphrase: jest.fn().mockReturnValue('Test SDF Network ; September 2015'),
  };

  const mockSupabaseFrom = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: { id: merchantId, name: 'TechStore', is_active: true },
      error: null,
    }),
  };

  const mockSupabaseClient = {
    from: jest.fn().mockReturnValue(mockSupabaseFrom),
  };

  const mockSupabaseService = {
    getServiceRoleClient: jest.fn().mockReturnValue(mockSupabaseClient),
    getClient: jest.fn().mockReturnValue(mockSupabaseClient),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        LoansModule,
      ],
    })
      .overrideProvider(ReputationContractClient)
      .useValue(mockReputationContract)
      .overrideProvider(SorobanService)
      .useValue(mockSorobanService)
      .overrideProvider(SupabaseService)
      .useValue(mockSupabaseService)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Re-wire the chained mock defaults
    mockReputationContract.getScore.mockResolvedValue(75);
    mockSupabaseClient.from.mockReturnValue(mockSupabaseFrom);
    mockSupabaseFrom.select.mockReturnThis();
    mockSupabaseFrom.eq.mockReturnThis();
    mockSupabaseFrom.single.mockResolvedValue({
      data: { id: merchantId, name: 'TechStore', is_active: true },
      error: null,
    });
    mockSupabaseService.getServiceRoleClient.mockReturnValue(mockSupabaseClient);
  });

  // ---------------------------------------------------------------------------
  // POST /loans/quote
  // ---------------------------------------------------------------------------
  describe('POST /loans/quote', () => {
    const validBody = { amount: 500, merchant: merchantId, term: 4 };

    it('should return 200 with a valid loan quote in response envelope', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/loans/quote',
        headers: { 'x-wallet-address': validWallet },
        payload: validBody,
      });

      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.payload);
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('message', 'Loan quote calculated successfully');
      expect(body).toHaveProperty('data');

      const { data } = body;
      expect(data).toHaveProperty('amount', 500);
      expect(data).toHaveProperty('guarantee', 100);
      expect(data).toHaveProperty('loanAmount', 400);
      expect(data).toHaveProperty('interestRate');
      expect(data).toHaveProperty('totalRepayment');
      expect(data).toHaveProperty('term', 4);
      expect(data).toHaveProperty('schedule');
      expect(data.schedule).toHaveLength(4);
    }, 10000);

    it('should return schedule with correct structure', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/loans/quote',
        headers: { 'x-wallet-address': validWallet },
        payload: validBody,
      });

      const body = JSON.parse(res.payload);
      const payment = body.data.schedule[0];

      expect(payment).toHaveProperty('paymentNumber', 1);
      expect(payment).toHaveProperty('amount');
      expect(payment).toHaveProperty('dueDate');
      expect(typeof payment.amount).toBe('number');
    }, 10000);

    it('should return 400 for missing wallet header', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/loans/quote',
        payload: validBody,
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for invalid wallet format', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/loans/quote',
        headers: { 'x-wallet-address': 'INVALID' },
        payload: validBody,
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for amount below minimum', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/loans/quote',
        headers: { 'x-wallet-address': validWallet },
        payload: { ...validBody, amount: 0 },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for amount above maximum', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/loans/quote',
        headers: { 'x-wallet-address': validWallet },
        payload: { ...validBody, amount: 20000 },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for non-integer term', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/loans/quote',
        headers: { 'x-wallet-address': validWallet },
        payload: { ...validBody, term: 2.5 },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for term exceeding 12 months', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/loans/quote',
        headers: { 'x-wallet-address': validWallet },
        payload: { ...validBody, term: 24 },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for invalid merchant UUID', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/loans/quote',
        headers: { 'x-wallet-address': validWallet },
        payload: { ...validBody, merchant: 'not-a-uuid' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 404 when merchant does not exist', async () => {
      mockSupabaseFrom.single.mockResolvedValue({
        data: null,
        error: { message: 'not found' },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/loans/quote',
        headers: { 'x-wallet-address': validWallet },
        payload: validBody,
      });

      expect(res.statusCode).toBe(404);
    }, 10000);

    it('should return 400 for forbidden extra fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/loans/quote',
        headers: { 'x-wallet-address': validWallet },
        payload: { ...validBody, extraField: 'hack' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 400 when amount exceeds user credit limit', async () => {
      // Score 40 → poor tier → maxCredit ~678
      mockReputationContract.getScore.mockResolvedValue(40);

      const res = await app.inject({
        method: 'POST',
        url: '/loans/quote',
        headers: { 'x-wallet-address': validWallet },
        payload: { ...validBody, amount: 5000 },
      });

      expect(res.statusCode).toBe(400);
    }, 10000);
  });
});
