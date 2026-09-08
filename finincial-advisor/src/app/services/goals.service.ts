import { Injectable, signal, inject, effect, untracked } from '@angular/core';
import { Observable, map } from 'rxjs';
import { AuthService } from './auth.service';
import { FirestoreService, GoalItem } from './firestore.service';
import { WorkflowService } from './ai-advisor.service';

export type { GoalItem };

export interface GoalAllocation {
  equity: number;
  debt: number;
  liquid: number;
  riskProfile: string;
  expectedAnnualReturn: number;
}

export interface GoalFinancials {
  requiredMonthlySavings: number;
  recommendedMonthlyBoost: number;
  timelineYears: number;
  remainingAmount: number;
  monthsRemaining: number;
  expectedAnnualReturn: number;
  formattedTarget: string;
  formattedSaved: string;
  formattedRequiredMonthly: string;
  formattedRecommendedBoost: string;
}

export const DEFAULT_GOALS: GoalItem[] = [
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
    color: 'var(--color-primary)',
    equityAllocation: 50,
    debtAllocation: 40,
    liquidAllocation: 10
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
    color: '#00A389',
    equityAllocation: 70,
    debtAllocation: 25,
    liquidAllocation: 5
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
    color: 'var(--color-liquid)',
    equityAllocation: 10,
    debtAllocation: 30,
    liquidAllocation: 60
  }
];

function getInitialCachedGoals(): GoalItem[] {
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem('finmate_goals_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
  }
  return DEFAULT_GOALS;
}

@Injectable({
  providedIn: 'root'
})
export class GoalsService {
  private authService = inject(AuthService);
  private firestoreService = inject(FirestoreService);
  private workflowService = inject(WorkflowService);

  isModalOpen = signal(false);
  isRecommendationModalOpen = signal(false);
  recommendationApplied = signal(false);
  toastMessage = signal<string | null>(null);
  isLoading = signal(false);
  isSyncing = signal(false);

  goals = signal<GoalItem[]>(getInitialCachedGoals());

  constructor() {
    effect(() => {
      const uid = this.authService.currentUserId();
      const isLoggedIn = this.authService.isLoggedIn();
      const isAuthChecking = this.authService.isAuthChecking();

      untracked(() => {
        if (isLoggedIn && uid) {
          this.loadGoalsFromFirestore(uid);
        } else if (!isLoggedIn && !isAuthChecking) {
          // Reset to local cached guest goals
          const cached = getInitialCachedGoals();
          this.goals.set(cached);
        }
      });
    });
  }

  private saveToLocalCache(goalsList: GoalItem[]): void {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('finmate_goals_cache', JSON.stringify(goalsList));
      } catch {}
    }
  }

  /**
   * Dynamically calculates smart asset allocation based on the goal's timeline & category
   */
  calculateSmartAllocation(goal?: Partial<GoalItem> | null): GoalAllocation {
    if (!goal) {
      return {
        equity: 50,
        debt: 40,
        liquid: 10,
        riskProfile: 'Balanced Growth',
        expectedAnnualReturn: 9.25
      };
    }

    // If goal already has custom or persisted allocation percentages
    if (
      goal.equityAllocation != null &&
      goal.debtAllocation != null &&
      goal.liquidAllocation != null &&
      (goal.equityAllocation + goal.debtAllocation + goal.liquidAllocation > 0)
    ) {
      const eq = goal.equityAllocation;
      const db = goal.debtAllocation;
      const lq = goal.liquidAllocation;
      const expReturn = Number(((eq * 12 + db * 7 + lq * 4.5) / 100).toFixed(2));
      let risk = 'Balanced Growth';
      if (eq >= 65) risk = 'High Growth / Aggressive';
      else if (eq >= 45) risk = 'Balanced Growth';
      else if (eq >= 25) risk = 'Moderate Stability';
      else risk = 'Capital Preservation / Low Risk';

      return {
        equity: eq,
        debt: db,
        liquid: lq,
        riskProfile: risk,
        expectedAnnualReturn: expReturn
      };
    }

    const timeline = Number(goal.timelineYears) || 3;
    const icon = goal.icon || 'house';

    if (icon === 'shield' || timeline <= 1) {
      return {
        equity: 10,
        debt: 30,
        liquid: 60,
        riskProfile: 'Capital Preservation / Low Risk',
        expectedAnnualReturn: 5.2
      };
    }

    if (timeline <= 3) {
      return {
        equity: 30,
        debt: 50,
        liquid: 20,
        riskProfile: 'Moderate (Stability Focus)',
        expectedAnnualReturn: 8.0
      };
    }

    if (timeline <= 7) {
      return {
        equity: 50,
        debt: 40,
        liquid: 10,
        riskProfile: 'Balanced Growth',
        expectedAnnualReturn: 9.25
      };
    }

    if (timeline <= 12) {
      return {
        equity: 65,
        debt: 25,
        liquid: 10,
        riskProfile: 'High Growth',
        expectedAnnualReturn: 10.0
      };
    }

    return {
      equity: 70,
      debt: 25,
      liquid: 5,
      riskProfile: 'Aggressive Wealth Creation',
      expectedAnnualReturn: 10.38
    };
  }

  /**
   * Dynamically calculates monthly savings requirement and AI recommended optimization boost
   */
  calculateGoalFinancials(goal?: GoalItem | null): GoalFinancials {
    if (!goal) {
      return {
        requiredMonthlySavings: 50000,
        recommendedMonthlyBoost: 5000,
        timelineYears: 5,
        remainingAmount: 3750000,
        monthsRemaining: 60,
        expectedAnnualReturn: 9.25,
        formattedTarget: '₹50,00,000',
        formattedSaved: '₹12,50,000',
        formattedRequiredMonthly: '₹40,000',
        formattedRecommendedBoost: '₹5,000'
      };
    }

    const target = Number(goal.targetAmount) || 0;
    const current = Number(goal.currentAmount) || 0;
    const timeline = Math.max(1, Number(goal.timelineYears) || 1);
    const months = timeline * 12;
    const remaining = Math.max(0, target - current);

    const alloc = this.calculateSmartAllocation(goal);
    const monthlyRate = (alloc.expectedAnnualReturn / 100) / 12;

    // Compound future value of existing savings
    const fvExisting = current * Math.pow(1 + monthlyRate, months);
    const gapAtMaturity = Math.max(0, target - fvExisting);

    // Compounded SIP calculation
    let reqMonthly = 0;
    if (gapAtMaturity > 0 && monthlyRate > 0) {
      const denom = ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) * (1 + monthlyRate);
      reqMonthly = denom > 0 ? Math.round(gapAtMaturity / denom) : Math.round(remaining / months);
    } else if (remaining > 0) {
      reqMonthly = Math.round(remaining / months);
    }

    // Clean rounding for required monthly contribution
    if (reqMonthly > 10000) {
      reqMonthly = Math.round(reqMonthly / 500) * 500;
    } else if (reqMonthly > 1000) {
      reqMonthly = Math.round(reqMonthly / 100) * 100;
    }

    // Dynamic recommended monthly boost calculation
    let boost = goal.monthlyBoost;
    if (!boost || boost <= 0) {
      if (remaining <= 0) {
        boost = 0;
      } else {
        // Recommend ~12-15% acceleration boost or minimum appropriate step
        const rawBoost = Math.max(1000, reqMonthly * 0.15);
        if (rawBoost >= 10000) {
          boost = Math.round(rawBoost / 1000) * 1000;
        } else if (rawBoost >= 3000) {
          boost = Math.round(rawBoost / 500) * 500;
        } else {
          boost = Math.round(rawBoost / 250) * 250;
        }
        boost = Math.max(1000, Math.min(boost, 50000));
      }
    }

    return {
      requiredMonthlySavings: reqMonthly,
      recommendedMonthlyBoost: boost,
      timelineYears: timeline,
      remainingAmount: remaining,
      monthsRemaining: months,
      expectedAnnualReturn: alloc.expectedAnnualReturn,
      formattedTarget: '₹' + target.toLocaleString('en-IN'),
      formattedSaved: '₹' + current.toLocaleString('en-IN'),
      formattedRequiredMonthly: '₹' + reqMonthly.toLocaleString('en-IN'),
      formattedRecommendedBoost: '₹' + boost.toLocaleString('en-IN')
    };
  }

  /**
   * Builds the formatted goal information string for Pipeline 22027
   * Payload template format matching dynamic goal metrics:
   * Goal Name: Buy a House
   * Target Amount: ₹50,00,000
   * Timeline: 5 years
   * Target Year: 2029
   * Current Saved Amount: ₹12,50,000
   * Current Progress: 25%
   * 
   * Current Investment Allocation:
   * Equity: 50%
   * Debt: 40%
   * Liquid: 10%
   * 
   * Recommended Monthly Savings Increase: ₹6,000
   */
  buildGoalInformationString(
    goal: GoalItem,
    boostAmount?: number,
    alloc?: { equity: number; debt: number; liquid: number }
  ): string {
    const currentYear = new Date().getFullYear();
    const timeline = goal.timelineYears || 3;
    const targetYear = goal.targetYear || (currentYear + timeline);
    const progress = goal.targetAmount > 0
      ? Math.round((goal.currentAmount / goal.targetAmount) * 100)
      : 0;

    const dynamicFinancials = this.calculateGoalFinancials(goal);
    const dynamicAlloc = alloc || this.calculateSmartAllocation(goal);
    const dynamicBoost = boostAmount ?? dynamicFinancials.recommendedMonthlyBoost;

    return `Goal Name: ${goal.title}
Target Amount: ₹${goal.targetAmount.toLocaleString('en-IN')}
Timeline: ${timeline} years
Target Year: ${targetYear}
Current Saved Amount: ₹${goal.currentAmount.toLocaleString('en-IN')}
Current Progress: ${progress}%

Current Investment Allocation:
Equity: ${dynamicAlloc.equity}%
Debt: ${dynamicAlloc.debt}%
Liquid: ${dynamicAlloc.liquid}%

Recommended Monthly Savings Increase: ₹${dynamicBoost.toLocaleString('en-IN')}`;
  }

  /**
   * Executes Aava Workflow Pipeline 22027 with input key '{{goal_information_string_true}}'
   */
  runGoalRecommendationWorkflow(
    goal: GoalItem,
    boostAmount?: number,
    strategy: string = 'balanced',
    alloc?: { equity: number; debt: number; liquid: number }
  ): Observable<{ replyText: string; rawResponse: any }> {
    const dynamicFinancials = this.calculateGoalFinancials(goal);
    const resolvedBoost = boostAmount ?? dynamicFinancials.recommendedMonthlyBoost;
    const resolvedAlloc = alloc || this.calculateSmartAllocation(goal);

    const formattedPayload = this.buildGoalInformationString(goal, resolvedBoost, resolvedAlloc);

    return this.workflowService
      .runWorkflowAndAwaitResult(formattedPayload, '{{goal_information_string_true}}', {
        pipelineId: '22027'
      })
      .pipe(
        map(response => {
          const replyText = this.workflowService.extractReplyText(response);
          return {
            replyText: replyText || 'Goal recommendation generated successfully.',
            rawResponse: response
          };
        })
      );
  }

  /**
   * Load user goals from Firestore
   */
  async loadGoalsFromFirestore(uid: string): Promise<void> {
    if (!uid) return;
    this.isLoading.set(true);
    try {
      const userGoals = await this.firestoreService.loadUserGoals(uid);
      if (userGoals && userGoals.length > 0) {
        this.goals.set(userGoals);
        this.saveToLocalCache(userGoals);
      } else {
        // First-time user: seed default starter goals into Firestore
        await this.firestoreService.saveAllGoals(uid, DEFAULT_GOALS);
        this.goals.set(DEFAULT_GOALS);
        this.saveToLocalCache(DEFAULT_GOALS);
      }
    } catch (error) {
      console.error('Failed to load goals from Firestore:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  openModal(): void {
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
  }

  openRecommendationModal(): void {
    this.isRecommendationModalOpen.set(true);
  }

  closeRecommendationModal(): void {
    this.isRecommendationModalOpen.set(false);
  }

  showToast(message: string): void {
    this.toastMessage.set(message);
    setTimeout(() => {
      this.toastMessage.set(null);
    }, 4000);
  }

  /**
   * Add a new financial goal and sync to Firestore
   */
  async addGoal(newGoal: Omit<GoalItem, 'id' | 'status'>): Promise<void> {
    const createdGoal: GoalItem = {
      ...newGoal,
      id: `goal-${Date.now()}`,
      status: 'On Track'
    };

    this.isSyncing.set(true);

    // Optimistically update local signal
    const updatedList = [...this.goals(), createdGoal];
    this.goals.set(updatedList);
    this.saveToLocalCache(updatedList);
    this.closeModal();

    const uid = this.authService.currentUserId();
    if (uid && this.authService.isLoggedIn()) {
      try {
        await this.firestoreService.saveGoal(uid, createdGoal);
        this.showToast(`Goal "${createdGoal.title}" saved to Firebase Cloud!`);
      } catch (error) {
        console.error('Error saving goal to Firestore:', error);
        this.showToast(`Goal saved locally. Sync failed: ${(error as any)?.message || 'Cloud error'}`);
      } finally {
        this.isSyncing.set(false);
      }
    } else {
      this.isSyncing.set(false);
      this.showToast(`Goal "${createdGoal.title}" created successfully!`);
    }
  }

  /**
   * Set primary goal and sync to Firestore
   */
  async setPrimaryGoal(id: string): Promise<void> {
    const updatedList = this.goals().map(g => ({
      ...g,
      isPrimary: g.id === id
    }));

    this.goals.set(updatedList);
    this.saveToLocalCache(updatedList);

    const uid = this.authService.currentUserId();
    if (uid && this.authService.isLoggedIn()) {
      this.isSyncing.set(true);
      try {
        await this.firestoreService.setPrimaryGoal(uid, id, updatedList);
      } catch (error) {
        console.error('Error updating primary goal in Firestore:', error);
      } finally {
        this.isSyncing.set(false);
      }
    }
  }

  /**
   * Delete goal and sync removal to Firestore
   */
  async deleteGoal(id: string): Promise<void> {
    let newPrimaryId: string | null = null;
    const filtered = this.goals().filter(g => g.id !== id);
    const hasPrimary = filtered.some(g => g.isPrimary);
    if (!hasPrimary && filtered.length > 0) {
      filtered[0] = { ...filtered[0], isPrimary: true };
      newPrimaryId = filtered[0].id;
    }

    this.goals.set(filtered);
    this.saveToLocalCache(filtered);

    const uid = this.authService.currentUserId();
    if (uid && this.authService.isLoggedIn()) {
      this.isSyncing.set(true);
      try {
        await this.firestoreService.deleteGoal(uid, id);
        if (newPrimaryId) {
          await this.firestoreService.setPrimaryGoal(uid, newPrimaryId, filtered);
        }
        this.showToast('Goal removed from Firebase Cloud.');
      } catch (error) {
        console.error('Error deleting goal from Firestore:', error);
        this.showToast('Goal removed locally.');
      } finally {
        this.isSyncing.set(false);
      }
    } else {
      this.showToast('Goal removed.');
    }
  }

  /**
   * Update custom allocation and/or monthly boost settings for a goal
   */
  async updateGoalCustomSettings(
    goalId: string,
    settings: {
      equityAllocation?: number;
      debtAllocation?: number;
      liquidAllocation?: number;
      monthlyBoost?: number;
    }
  ): Promise<void> {
    let targetGoal: GoalItem | null = null;
    const updatedList = this.goals().map(g => {
      if (g.id === goalId || (!goalId && g.isPrimary)) {
        const updated: GoalItem = {
          ...g,
          equityAllocation: settings.equityAllocation !== undefined ? settings.equityAllocation : g.equityAllocation,
          debtAllocation: settings.debtAllocation !== undefined ? settings.debtAllocation : g.debtAllocation,
          liquidAllocation: settings.liquidAllocation !== undefined ? settings.liquidAllocation : g.liquidAllocation,
          monthlyBoost: settings.monthlyBoost !== undefined ? settings.monthlyBoost : g.monthlyBoost
        };
        targetGoal = updated;
        return updated;
      }
      return g;
    });

    this.goals.set(updatedList);
    this.saveToLocalCache(updatedList);

    const uid = this.authService.currentUserId();
    if (uid && this.authService.isLoggedIn() && targetGoal) {
      try {
        await this.firestoreService.saveGoal(uid, targetGoal);
      } catch (error) {
        console.error('Error updating goal settings in Firestore:', error);
      }
    }
  }

  /**
   * Apply AI recommendation boost and persist to Firestore
   */
  async applyRecommendation(
    goalId: string,
    boostAmount: number,
    strategy: string,
    recommendationResponse?: string,
    alloc?: { equity: number; debt: number; liquid: number }
  ): Promise<void> {
    let targetGoal: GoalItem | null = null;

    const updatedList = this.goals().map(g => {
      if (g.id === goalId || (!goalId && g.isPrimary)) {
        const updated: GoalItem = {
          ...g,
          status: 'Optimized',
          currentAmount: g.currentAmount + boostAmount,
          monthlyBoost: boostAmount,
          strategy: strategy,
          recommendationResponse: recommendationResponse ?? g.recommendationResponse,
          equityAllocation: alloc?.equity ?? g.equityAllocation,
          debtAllocation: alloc?.debt ?? g.debtAllocation,
          liquidAllocation: alloc?.liquid ?? g.liquidAllocation
        };
        targetGoal = updated;
        return updated;
      }
      return g;
    });

    this.goals.set(updatedList);
    this.saveToLocalCache(updatedList);
    this.recommendationApplied.set(true);

    const uid = this.authService.currentUserId();
    if (uid && this.authService.isLoggedIn() && targetGoal) {
      this.isSyncing.set(true);
      try {
        await this.firestoreService.saveGoal(uid, targetGoal);
        this.showToast(`AI Recommendation saved to Firebase! (+₹${boostAmount.toLocaleString('en-IN')}/mo)`);
      } catch (error) {
        console.error('Error updating recommendation in Firestore:', error);
        this.showToast(`Recommendation applied! Added ₹${boostAmount.toLocaleString('en-IN')}/mo optimization.`);
      } finally {
        this.isSyncing.set(false);
      }
    } else {
      this.showToast(`Recommendation applied! Added ₹${boostAmount.toLocaleString('en-IN')}/mo optimization.`);
    }
  }
}
