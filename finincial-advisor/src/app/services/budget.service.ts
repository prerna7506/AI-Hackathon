import { Injectable, signal, computed, inject } from '@angular/core';
import { GoalsService } from './goals.service';

export interface BudgetCategory {
  id: string;
  name: string;
  icon: string;
  allocated: number;
  spent: number;
  color: string;
  isOverBudget?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class BudgetService {
  private goalsService = inject(GoalsService);

  isModalOpen = signal(false);
  monthlyIncome = signal(150000);

  categories = signal<BudgetCategory[]>([
    {
      id: 'dining',
      name: 'Dining & Food Out',
      icon: 'utensils',
      allocated: 22000,
      spent: 27500,
      color: '#EF4444',
      isOverBudget: true
    },
    {
      id: 'housing',
      name: 'Housing & Utilities',
      icon: 'home',
      allocated: 45000,
      spent: 45000,
      color: '#3B82F6',
      isOverBudget: false
    },
    {
      id: 'transport',
      name: 'Transport & Fuel',
      icon: 'car',
      allocated: 12000,
      spent: 9800,
      color: '#8B5CF6',
      isOverBudget: false
    },
    {
      id: 'leisure',
      name: 'Entertainment & Leisure',
      icon: 'film',
      allocated: 16000,
      spent: 14200,
      color: '#F59E0B',
      isOverBudget: false
    },
    {
      id: 'shopping',
      name: 'Shopping & Essentials',
      icon: 'shopping-bag',
      allocated: 15000,
      spent: 11500,
      color: '#00A389',
      isOverBudget: false
    }
  ]);

  totalAllocated = computed(() => {
    return this.categories().reduce((sum, c) => sum + c.allocated, 0);
  });

  totalSpent = computed(() => {
    return this.categories().reduce((sum, c) => sum + c.spent, 0);
  });

  projectedMonthlySavings = computed(() => {
    return Math.max(0, this.monthlyIncome() - this.totalAllocated());
  });

  openModal(): void {
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
  }

  updateCategoryAllocation(id: string, newAllocation: number): void {
    this.categories.update(list =>
      list.map(c => {
        if (c.id === id) {
          return {
            ...c,
            allocated: newAllocation,
            isOverBudget: c.spent > newAllocation
          };
        }
        return c;
      })
    );
  }

  applySmartRebalance(): void {
    this.categories.update(list =>
      list.map(c => {
        if (c.id === 'dining') {
          return { ...c, allocated: 20000, isOverBudget: false };
        }
        if (c.id === 'leisure') {
          return { ...c, allocated: 12000, isOverBudget: false };
        }
        return c;
      })
    );
    this.goalsService.showToast('AI Smart Rebalance applied! Freed ₹6,000 to boost your savings goals.');
  }

  saveBudget(): void {
    this.closeModal();
    this.goalsService.showToast('Monthly budget allocations updated successfully!');
  }
}
