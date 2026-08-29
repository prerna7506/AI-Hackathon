import { Injectable, signal, inject, effect, untracked } from '@angular/core';
import { AuthService } from './auth.service';
import { FirestoreService, GoalItem } from './firestore.service';

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
        console.log('🌱 Seeding initial starter goals for new user into Firestore...');
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
        this.showToast(`🎯 Goal "${createdGoal.title}" saved to Firebase Cloud!`);
      } catch (error) {
        console.error('Error saving goal to Firestore:', error);
        this.showToast(`⚠️ Goal saved locally. Sync failed: ${(error as any)?.message || 'Cloud error'}`);
      } finally {
        this.isSyncing.set(false);
      }
    } else {
      this.isSyncing.set(false);
      this.showToast(`🎯 Goal "${createdGoal.title}" created successfully!`);
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
        this.showToast('🗑️ Goal removed from Firebase Cloud.');
      } catch (error) {
        console.error('Error deleting goal from Firestore:', error);
        this.showToast('🗑️ Goal removed locally.');
      } finally {
        this.isSyncing.set(false);
      }
    } else {
      this.showToast('🗑️ Goal removed.');
    }
  }

  /**
   * Apply AI recommendation boost and persist to Firestore
   */
  async applyRecommendation(goalId: string, boostAmount: number, strategy: string): Promise<void> {
    let targetGoal: GoalItem | null = null;

    const updatedList = this.goals().map(g => {
      if (g.id === goalId || (!goalId && g.isPrimary)) {
        const updated: GoalItem = {
          ...g,
          status: 'Optimized',
          currentAmount: g.currentAmount + boostAmount,
          monthlyBoost: boostAmount,
          strategy: strategy
        };
        targetGoal = updated;
        return updated;
      }
      return g;
    });

    this.goals.set(updatedList);
    this.saveToLocalCache(updatedList);
    this.recommendationApplied.set(true);
    this.closeRecommendationModal();

    const uid = this.authService.currentUserId();
    if (uid && this.authService.isLoggedIn() && targetGoal) {
      this.isSyncing.set(true);
      try {
        await this.firestoreService.saveGoal(uid, targetGoal);
        this.showToast(`✨ Recommendation applied & saved to Firebase! (+₹${boostAmount.toLocaleString('en-IN')}/mo)`);
      } catch (error) {
        console.error('Error updating recommendation in Firestore:', error);
        this.showToast(`✨ Recommendation applied! Added ₹${boostAmount.toLocaleString('en-IN')}/mo optimization.`);
      } finally {
        this.isSyncing.set(false);
      }
    } else {
      this.showToast(`✨ Recommendation applied! Added ₹${boostAmount.toLocaleString('en-IN')}/mo optimization to your plan.`);
    }
  }
}
