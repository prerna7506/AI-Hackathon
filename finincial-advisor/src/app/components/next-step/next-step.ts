import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GoalsService } from '../../services/goals.service';

@Component({
  selector: 'app-next-step',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './next-step.html',
  styleUrl: './next-step.scss'
})
export class NextStepComponent {
  goalsService = inject(GoalsService);

  primaryGoal = computed(() => {
    const goals = this.goalsService.goals();
    return goals.find(g => g.isPrimary) || goals[0] || null;
  });

  isApplied = computed(() => {
    const goal = this.primaryGoal();
    return goal?.status === 'Optimized' || this.goalsService.recommendationApplied();
  });

  recommendationText = computed(() => {
    const goal = this.primaryGoal();
    const timeline = goal?.timelineYears || 5;
    return `To stay on track for your ${timeline}-year timeline, FinMate AI recommends optimizing your monthly contributions.`;
  });

  highlightText = computed(() => {
    const goal = this.primaryGoal();
    if (goal?.monthlyBoost) {
      return `Monthly contribution optimized (+₹${goal.monthlyBoost.toLocaleString('en-IN')}/mo active)`;
    }
    return 'Increase monthly savings by ₹5,000.';
  });

  openRecommendationModal(): void {
    this.goalsService.openRecommendationModal();
  }
}
