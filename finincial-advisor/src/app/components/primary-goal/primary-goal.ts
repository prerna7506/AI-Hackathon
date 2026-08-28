import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GoalsService } from '../../services/goals.service';

@Component({
  selector: 'app-primary-goal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './primary-goal.html',
  styleUrl: './primary-goal.scss'
})
export class PrimaryGoalComponent {
  goalsService = inject(GoalsService);

  primaryGoal = computed(() => {
    const goals = this.goalsService.goals();
    return goals.find(g => g.isPrimary) || goals[0] || null;
  });

  goalTitle = computed(() => this.primaryGoal()?.title ?? '—');
  status = computed(() => this.primaryGoal()?.status ?? '—');

  targetAmount = computed(() => {
    const goal = this.primaryGoal();
    return goal ? this.formatCurrency(goal.targetAmount) : '—';
  });

  timelineYears = computed(() => {
    const goal = this.primaryGoal();
    return goal ? `${goal.timelineYears} Years` : '—';
  });

  timelineYearEnd = computed(() => {
    const goal = this.primaryGoal();
    return goal ? `(${goal.targetYear})` : '';
  });

  currentProgressAmount = computed(() => {
    const goal = this.primaryGoal();
    return goal ? this.formatCurrency(goal.currentAmount) : '—';
  });

  progressPercentage = computed(() => {
    const goal = this.primaryGoal();
    if (!goal || !goal.targetAmount) return 0;
    return Math.round((goal.currentAmount / goal.targetAmount) * 100);
  });

  iconType = computed(() => this.primaryGoal()?.icon ?? 'house');

  private formatCurrency(value: number): string {
    return '₹' + value.toLocaleString('en-IN');
  }
}
