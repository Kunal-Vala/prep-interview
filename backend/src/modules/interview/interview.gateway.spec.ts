import { Test, TestingModule } from '@nestjs/testing';
import { InterviewGateway } from './interview.gateway';

describe('InterviewGateway', () => {
  let gateway: InterviewGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InterviewGateway],
    }).compile();

    gateway = module.get<InterviewGateway>(InterviewGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
