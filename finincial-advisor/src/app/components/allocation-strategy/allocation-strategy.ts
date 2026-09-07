import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GoalsService } from '../../services/goals.service';

interface AllocationItem {
  name: string;
  subtitle: string;
  percentage: number;
  color: string;
}

@Component({
  selector: 'app-allocation-strategy',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './allocation-strategy.html',
  styleUrl: './allocation-strategy.scss'
})
export class AllocationStrategyComponent {
  goalsService = inject(GoalsService);

  primaryGoal = computed(() => {
    const goals = this.goalsService.goals();
    return goals.find(g => g.isPrimary) || goals[0] || null;
  });

  allocations = computed<AllocationItem[]>(() => {
    const goal = this.primaryGoal();
    const equity = goal?.equityAllocation ?? 50;
    const debt = goal?.debtAllocation ?? 40;
    const liquid = goal?.liquidAllocation ?? 10;

    return [
      { name: 'Equity', subtitle: '(High Growth)', percentage: equity, color: 'var(--color-equity)' },
      { name: 'Debt', subtitle: '(Stability)', percentage: debt, color: 'var(--color-debt)' },
      { name: 'Liquid', subtitle: '(Emergency)', percentage: liquid, color: 'var(--color-liquid)' }
    ];
  });
}
