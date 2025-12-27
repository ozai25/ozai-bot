import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should be defined', () => {
      expect(appController).toBeDefined();
    });

    it('should have getHello method', () => {
      // "as any" avoids TS errors if the method signature changes,
      // while still letting the test fail meaningfully at runtime.
      expect(typeof (appController as any).getHello).toBe('function');
    });

    it('should return "Hello World!"', () => {
      expect((appController as any).getHello()).toBe('Hello World!');
    });
  });
});
