import { Component, inject, computed, signal, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GoalsService } from '../../services/goals.service';

@Component({
  selector: 'app-next-step',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './next-step.html',
  styleUrl: './next-step.scss'
})
export class NextStepComponent {
  goalsService = inject(GoalsService);

  isEditingBoost = signal(false);
  customBoostAmount = signal<number>(5000);

  primaryGoal = computed(() => {
    const goals = this.goalsService.goals();
    return goals.find(g => g.isPrimary) || goals[0] || null;
  });

  financials = computed(() => {
    const goal = this.primaryGoal();
    return this.goalsService.calculateGoalFinancials(goal);
  });

  isApplied = computed(() => {
    const goal = this.primaryGoal();
    return goal?.status === 'Optimized' || this.goalsService.recommendationApplied();
  });

  recommendationText = computed(() => {
    const goal = this.primaryGoal();
    const timeline = goal?.timelineYears || this.financials().timelineYears || 5;
    if (this.isApplied()) {
      return `Monthly contributions optimized for your ${timeline}-year milestone based on FinMate AI analysis.`;
    }
    return `Generate customized monthly savings and asset allocation recommendations for your ${timeline}-year goal.`;
  });

  highlightText = computed(() => {
    const goal = this.primaryGoal();
    const currentBoost = goal?.monthlyBoost || 0;

    if (this.isApplied() && currentBoost > 0) {
      return `Monthly contribution optimized (+₹${currentBoost.toLocaleString('en-IN')}/mo active)`;
    }
    return `AI Optimization Pending — Click below to generate recommendation`;
  });

  targetDetailsText = computed(() => {
    const goal = this.primaryGoal();
    const fin = this.financials();
    if (!goal) return '';
    const curSavingStr = fin.currentMonthlySavings > 0 ? ` • Current: ₹${fin.currentMonthlySavings.toLocaleString('en-IN')}/mo` : '';
    const reqSavingStr = ` • Required: ₹${fin.requiredMonthlySavings.toLocaleString('en-IN')}/mo`;
    return `Target: ₹${goal.targetAmount.toLocaleString('en-IN')} by ${goal.targetYear}${curSavingStr}${reqSavingStr}`;
  });

  constructor() {
    effect(() => {
      const goal = this.primaryGoal();
      const fin = this.financials();
      untracked(() => {
        if (!this.isEditingBoost()) {
          this.customBoostAmount.set(goal?.monthlyBoost || fin.recommendedMonthlyBoost);
        }
      });
    });
  }

  toggleEditBoost(): void {
    if (!this.isEditingBoost()) {
      const goal = this.primaryGoal();
      const fin = this.financials();
      this.customBoostAmount.set(goal?.monthlyBoost || fin.recommendedMonthlyBoost);
      this.isEditingBoost.set(true);
    } else {
      this.isEditingBoost.set(false);
    }
  }

  setBoostPreset(amount: number): void {
    this.customBoostAmount.set(amount);
  }

  async saveCustomBoost(): Promise<void> {
    const goal = this.primaryGoal();
    if (!goal) return;

    const boost = Number(this.customBoostAmount()) || 0;
    if (boost <= 0) return;

    await this.goalsService.updateGoalCustomSettings(goal.id, {
      monthlyBoost: boost
    });

    this.goalsService.showToast(`Set monthly savings recommendation to +₹${boost.toLocaleString('en-IN')}/mo for "${goal.title}".`);
    this.isEditingBoost.set(false);
  }

  openRecommendationModal(): void {
    this.goalsService.openRecommendationModal();
  }
}


