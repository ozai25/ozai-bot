import { Module } from '@nestjs/common';
import { QueuesModule } from '../queues/queues.module';
import { AiModule } from '../ai/ai.module'; // ✅ IMPORTANT PATH
import { TestController } from './test.controller';
import { ThrottleTestController } from './throttle-test.controller';

@Module({
  imports: [QueuesModule, AiModule],
  controllers: [TestController, ThrottleTestController],
})
export class TestModule {}
