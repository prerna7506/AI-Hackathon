import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PrimaryGoalComponent } from '../primary-goal/primary-goal';
import { AllocationStrategyComponent } from '../allocation-strategy/allocation-strategy';
import { NextStepComponent } from '../next-step/next-step';
import { PortfolioComponent } from '../portfolio/portfolio';
import { GoalsService } from '../../services/goals.service';

@Component({
  selector: 'app-financial-goals',
  standalone: true,
  imports: [
    CommonModule,
    PrimaryGoalComponent,
    AllocationStrategyComponent,
    NextStepComponent,
    PortfolioComponent
  ],
  templateUrl: './financial-goals.html',
  styleUrl: './financial-goals.scss'
})
export class FinancialGoalsComponent {
  goalsService = inject(GoalsService);
}
