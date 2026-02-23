import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoansController } from './loans.controller';
import { LoansService } from './loans.service';
import { ReputationModule } from '../reputation/reputation.module';
import { SupabaseService } from '../../database/supabase.client';

@Module({
  imports: [ConfigModule, ReputationModule],
  controllers: [LoansController],
  providers: [LoansService, SupabaseService],
  exports: [LoansService],
})
export class LoansModule {}
