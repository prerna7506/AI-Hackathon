import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from './components/sidebar/sidebar';
import { AuthModalComponent } from './components/auth-modal/auth-modal';
import { CreateGoalModalComponent } from './components/create-goal-modal/create-goal-modal';
import { ApplyRecommendationModalComponent } from './components/apply-recommendation-modal/apply-recommendation-modal';
import { ReviewBudgetModalComponent } from './components/review-budget-modal/review-budget-modal';
import { GoalsService } from './services/goals.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    SidebarComponent,
    AuthModalComponent,
    CreateGoalModalComponent,
    ApplyRecommendationModalComponent,
    ReviewBudgetModalComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  goalsService = inject(GoalsService);
}
