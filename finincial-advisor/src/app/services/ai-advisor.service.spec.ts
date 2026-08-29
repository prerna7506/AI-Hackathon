import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { AiAdvisorService } from './ai-advisor.service';

describe('AiAdvisorService', () => {
  let service: AiAdvisorService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(AiAdvisorService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
