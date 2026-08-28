import { Injectable, signal } from '@angular/core';

export interface GoalItem {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  timelineYears: number;
  targetYear: number;
  icon: 'house' | 'car' | 'flight' | 'graduation' | 'retirement' | 'shield';
  status: string;
  isPrimary?: boolean;
  color?: string;
  monthlyBoost?: number;
  strategy?: string;
}

@Injectable({
  providedIn: 'root'
})
export class GoalsService {
  isModalOpen = signal(false);
  isRecommendationModalOpen = signal(false);
  recommendationApplied = signal(false);
  toastMessage = signal<string | null>(null);

  goals = signal<GoalItem[]>([
    {
      id: 'house',
      title: 'Buy a House',
      targetAmount: 5000000,
      currentAmount: 1250000,
      timelineYears: 5,
      targetYear: 2029,
      icon: 'house',
      status: 'On Track',
      isPrimary: true,
      color: 'var(--color-primary)'
    },
    {
      id: 'retirement',
      title: 'Retirement',
      targetAmount: 20000000,
      currentAmount: 3000000,
      timelineYears: 20,
      targetYear: 2044,
      icon: 'retirement',
      status: 'On Track',
      isPrimary: false,
      color: '#00A389'
    },
    {
      id: 'emergency',
      title: 'Emergency Fund',
      targetAmount: 1000000,
      currentAmount: 800000,
      timelineYears: 1,
      targetYear: 2025,
      icon: 'shield',
      status: 'On Track',
      isPrimary: false,
      color: 'var(--color-liquid)'
    }
  ]);

  openModal(): void {
    this.isModalOpen.set(true);
  }

  openRecommendationModal(): void {
    this.isRecommendationModalOpen.set(true);
  }

  closeRecommendationModal(): void {
    this.isRecommendationModalOpen.set(false);
  }

  applyRecommendation(goalId: string, boostAmount: number, strategy: string): void {
    this.goals.update(list =>
      list.map(g => {
        if (g.id === goalId || (!goalId && g.isPrimary)) {
          return {
            ...g,
            status: 'Optimized',
            currentAmount: g.currentAmount + boostAmount,
            monthlyBoost: boostAmount,
            strategy: strategy
          };
        }
        return g;
      })
    );

    this.recommendationApplied.set(true);
    this.closeRecommendationModal();
    this.showToast(`✨ Recommendation applied! Added ₹${boostAmount.toLocaleString('en-IN')}/mo optimization to your plan.`);
  }

  showToast(message: string): void {
    this.toastMessage.set(message);
    setTimeout(() => {
      this.toastMessage.set(null);
    }, 4000);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
  }

  setPrimaryGoal(id: string): void {
    this.goals.update(list => 
      list.map(g => ({
        ...g,
        isPrimary: g.id === id
      }))
    );
  }

  addGoal(newGoal: Omit<GoalItem, 'id' | 'status'>): void {
    const createdGoal: GoalItem = {
      ...newGoal,
      id: `goal-${Date.now()}`,
      status: 'On Track'
    };

    this.goals.update(list => [...list, createdGoal]);
    this.closeModal();
  }

  deleteGoal(id: string): void {
    this.goals.update(list => {
      const filtered = list.filter(g => g.id !== id);
      // If the deleted goal was primary, make the first remaining one primary
      const hasPrimary = filtered.some(g => g.isPrimary);
      if (!hasPrimary && filtered.length > 0) {
        filtered[0] = { ...filtered[0], isPrimary: true };
      }
      return filtered;
    });
  }
}
