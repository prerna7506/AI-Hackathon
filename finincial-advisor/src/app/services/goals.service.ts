import { Injectable, signal, inject, effect, untracked } from '@angular/core';
import { Observable, map } from 'rxjs';
import { AuthService } from './auth.service';
import { FirestoreService, GoalItem } from './firestore.service';
import { WorkflowService } from './ai-advisor.service';

export type { GoalItem };

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
   * Builds the formatted goal information string for Pipeline 22027
   * Payload template format matching user specification:
   * Goal Name: Buy a Car
   * Target Amount: ₹10,00,000
   * Timeline: 3 years
   * Target Year: 2029
   * Current Saved Amount: ₹2,00,000
   * Current Progress: 20%
   * 
   * Current Investment Allocation:
   * Equity: 50%
   * Debt: 40%
   * Liquid: 10%
   * 
   * Recommended Monthly Savings Increase: ₹5,000
   */
  buildGoalInformationString(
    goal: GoalItem,
    boostAmount: number = 5000,
    alloc: { equity: number; debt: number; liquid: number } = { equity: 50, debt: 40, liquid: 10 }
  ): string {
    const currentYear = new Date().getFullYear();
    const timeline = goal.timelineYears || 3;
    const targetYear = goal.targetYear || (currentYear + timeline);
    const progress = goal.targetAmount > 0
      ? Math.round((goal.currentAmount / goal.targetAmount) * 100)
      : 0;

    return `Goal Name: ${goal.title}
Target Amount: ₹${goal.targetAmount.toLocaleString('en-IN')}
Timeline: ${timeline} years
Target Year: ${targetYear}
Current Saved Amount: ₹${goal.currentAmount.toLocaleString('en-IN')}
Current Progress: ${progress}%

Current Investment Allocation:
Equity: ${alloc.equity}%
Debt: ${alloc.debt}%
Liquid: ${alloc.liquid}%

Recommended Monthly Savings Increase: ₹${boostAmount.toLocaleString('en-IN')}`;
  }

  /**
   * Executes Aava Workflow Pipeline 22027 with input key '{{goal_information_string_true}}'
   */
  runGoalRecommendationWorkflow(
    goal: GoalItem,
    boostAmount: number = 5000,
    strategy: string = 'balanced',
    alloc: { equity: number; debt: number; liquid: number } = { equity: 50, debt: 40, liquid: 10 }
  ): Observable<{ replyText: string; rawResponse: any }> {
    const formattedPayload = this.buildGoalInformationString(goal, boostAmount, alloc);

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
