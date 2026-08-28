import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GoalsService } from '../../services/goals.service';

@Component({
  selector: 'app-portfolio',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './portfolio.html',
  styleUrl: './portfolio.scss'
})
export class PortfolioComponent {
  goalsService = inject(GoalsService);

  selectedGoalId = signal<string | null>(null);

  goals = computed(() => {
    const allGoals = this.goalsService.goals();
    const selectedId = this.selectedGoalId();

    return allGoals.map(g => ({
      id: g.id,
      title: g.title,
      targetText: this.formatTargetText(g.targetAmount),
      percentage: g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0,
      icon: g.icon,
      active: selectedId ? g.id === selectedId : g.isPrimary === true,
      color: g.color || 'var(--color-primary)'
    }));
  });

  selectGoal(id: string): void {
    this.selectedGoalId.set(id);
    this.goalsService.setPrimaryGoal(id);
  }

  deleteGoal(event: Event, id: string): void {
    event.stopPropagation();
    if (this.selectedGoalId() === id) {
      this.selectedGoalId.set(null);
    }
    this.goalsService.deleteGoal(id);
  }

  private formatTargetText(amount: number): string {
    if (amount >= 10000000) {
      return `₹${(amount / 10000000).toFixed(amount % 10000000 === 0 ? 0 : 1)}Cr Goal`;
    }
    if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(amount % 100000 === 0 ? 0 : 1)}L Goal`;
    }
    return `₹${amount.toLocaleString('en-IN')} Goal`;
  }
}
