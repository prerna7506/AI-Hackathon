import { Component, inject, computed, signal, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  imports: [CommonModule, FormsModule],
  templateUrl: './allocation-strategy.html',
  styleUrl: './allocation-strategy.scss'
})
export class AllocationStrategyComponent {
  goalsService = inject(GoalsService);

  isEditing = signal(false);
  customEquity = signal(50);
  customDebt = signal(40);
  customLiquid = signal(10);
  errorMessage = signal<string | null>(null);

  primaryGoal = computed(() => {
    const goals = this.goalsService.goals();
    return goals.find(g => g.isPrimary) || goals[0] || null;
  });

  smartAllocation = computed(() => {
    const goal = this.primaryGoal();
    return this.goalsService.calculateSmartAllocation(goal);
  });

  riskProfile = computed(() => {
    return this.smartAllocation().riskProfile;
  });

  expectedAnnualReturn = computed(() => {
    return this.smartAllocation().expectedAnnualReturn;
  });

  allocations = computed<AllocationItem[]>(() => {
    const alloc = this.smartAllocation();

    return [
      { name: 'Equity', subtitle: '(High Growth)', percentage: alloc.equity, color: 'var(--color-equity)' },
      { name: 'Debt', subtitle: '(Stability)', percentage: alloc.debt, color: 'var(--color-debt)' },
      { name: 'Liquid', subtitle: '(Emergency)', percentage: alloc.liquid, color: 'var(--color-liquid)' }
    ];
  });

  totalCustomPercentage = computed(() => {
    return (Number(this.customEquity()) || 0) + (Number(this.customDebt()) || 0) + (Number(this.customLiquid()) || 0);
  });

  constructor() {
    // Sync current goal allocation into custom signals whenever active goal changes
    effect(() => {
      const alloc = this.smartAllocation();
      untracked(() => {
        if (!this.isEditing()) {
          this.customEquity.set(alloc.equity);
          this.customDebt.set(alloc.debt);
          this.customLiquid.set(alloc.liquid);
        }
      });
    });
  }

  toggleEdit(): void {
    if (!this.isEditing()) {
      const alloc = this.smartAllocation();
      this.customEquity.set(alloc.equity);
      this.customDebt.set(alloc.debt);
      this.customLiquid.set(alloc.liquid);
      this.errorMessage.set(null);
      this.isEditing.set(true);
    } else {
      this.cancelEdit();
    }
  }

  cancelEdit(): void {
    const alloc = this.smartAllocation();
    this.customEquity.set(alloc.equity);
    this.customDebt.set(alloc.debt);
    this.customLiquid.set(alloc.liquid);
    this.errorMessage.set(null);
    this.isEditing.set(false);
  }

  setPreset(equity: number, debt: number, liquid: number): void {
    this.customEquity.set(equity);
    this.customDebt.set(debt);
    this.customLiquid.set(liquid);
    this.errorMessage.set(null);
  }

  async saveAllocation(): Promise<void> {
    const eq = Number(this.customEquity()) || 0;
    const db = Number(this.customDebt()) || 0;
    const lq = Number(this.customLiquid()) || 0;
    const total = eq + db + lq;

    if (total !== 100) {
      this.errorMessage.set(`Total allocation is ${total}%. It must sum to 100%.`);
      return;
    }

    const goal = this.primaryGoal();
    if (!goal) return;

    this.errorMessage.set(null);
    await this.goalsService.updateGoalCustomSettings(goal.id, {
      equityAllocation: eq,
      debtAllocation: db,
      liquidAllocation: lq
    });

    this.goalsService.showToast(`Updated allocation for "${goal.title}": ${eq}% Equity, ${db}% Debt, ${lq}% Liquid.`);
    this.isEditing.set(false);
  }
}


