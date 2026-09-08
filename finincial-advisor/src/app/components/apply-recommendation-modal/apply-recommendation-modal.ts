import { Component, inject, computed, signal, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { GoalsService, GoalItem } from '../../services/goals.service';
import { MarkdownPipe } from '../../pipes/markdown.pipe';

@Component({
  selector: 'app-apply-recommendation-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, MarkdownPipe],
  templateUrl: './apply-recommendation-modal.html',
  styleUrl: './apply-recommendation-modal.scss'
})
export class ApplyRecommendationModalComponent {
  goalsService = inject(GoalsService);
  private router = inject(Router);

  // Dynamic monthly boost amount signal & custom allocations
  boostAmount = signal<number>(5000);
  customEquity = signal<number>(50);
  customDebt = signal<number>(40);
  customLiquid = signal<number>(10);
  selectedStrategy = 'balanced';
  showCustomParams = signal<boolean>(false);
  
  viewMode = signal<'loading' | 'result'>('loading');
  isApplying = signal(false);
  loadingStep = signal('Submitting goal data to Pipeline 22027...');
  recommendationResult = signal<string | null>(null);
  errorMessage = signal<string | null>(null);

  activeGoal = computed(() => {
    const goals = this.goalsService.goals();
    return goals.find(g => g.isPrimary) || goals[0] || null;
  });

  smartAllocation = computed(() => {
    const goal = this.activeGoal();
    return this.goalsService.calculateSmartAllocation(goal);
  });

  financials = computed(() => {
    const goal = this.activeGoal();
    return this.goalsService.calculateGoalFinancials(goal);
  });

  currentAllocation = computed(() => {
    return {
      equity: Number(this.customEquity()) || 0,
      debt: Number(this.customDebt()) || 0,
      liquid: Number(this.customLiquid()) || 0
    };
  });

  totalAllocation = computed(() => {
    return this.currentAllocation().equity + this.currentAllocation().debt + this.currentAllocation().liquid;
  });

  constructor() {
    // When modal opens, sync dynamic boost and auto-run analysis if no cached result, or show cached result
    effect(() => {
      const isOpen = this.goalsService.isRecommendationModalOpen();
      const goal = this.activeGoal();
      const fin = this.financials();
      const alloc = this.smartAllocation();

      untracked(() => {
        if (isOpen && goal) {
          // Initialize dynamic boost and allocation from goal metrics
          const dynamicBoost = goal.monthlyBoost && goal.monthlyBoost > 0
            ? goal.monthlyBoost
            : fin.recommendedMonthlyBoost;
          this.boostAmount.set(dynamicBoost);
          this.customEquity.set(alloc.equity);
          this.customDebt.set(alloc.debt);
          this.customLiquid.set(alloc.liquid);

          if (goal.recommendationResponse) {
            this.recommendationResult.set(goal.recommendationResponse);
            this.viewMode.set('result');
            this.isApplying.set(false);
          } else {
            this.runAnalysis();
          }
        }
      });
    });
  }

  setBoostPreset(amount: number): void {
    this.boostAmount.set(amount);
  }

  setAllocPreset(eq: number, db: number, lq: number): void {
    this.customEquity.set(eq);
    this.customDebt.set(db);
    this.customLiquid.set(lq);
  }

  toggleCustomParams(): void {
    this.showCustomParams.set(!this.showCustomParams());
  }

  close(): void {
    this.errorMessage.set(null);
    this.goalsService.closeRecommendationModal();
  }

  runAnalysis(): void {
    const goal = this.activeGoal();
    if (!goal) return;

    const currentBoost = this.boostAmount();
    const alloc = this.currentAllocation();

    this.isApplying.set(true);
    this.viewMode.set('loading');
    this.errorMessage.set(null);
    this.loadingStep.set('Submitting goal data to Pipeline 22027 (Goal Advisor)...');

    setTimeout(() => {
      if (this.isApplying()) {
        this.loadingStep.set('Evaluating timeline & investment allocation risk...');
      }
    }, 3000);

    setTimeout(() => {
      if (this.isApplying()) {
        this.loadingStep.set('Finalizing AI goal optimization recommendations...');
      }
    }, 6000);

    this.goalsService
      .runGoalRecommendationWorkflow(goal, currentBoost, this.selectedStrategy, alloc)
      .subscribe({
        next: async (res) => {
          this.isApplying.set(false);
          this.recommendationResult.set(res.replyText);
          this.viewMode.set('result');

          // Cache recommendation response
          await this.goalsService.applyRecommendation(
            goal.id,
            0, // only cache the text first without applying boost until user confirms
            this.selectedStrategy,
            res.replyText,
            alloc
          );
        },
        error: (err) => {
          console.error('[ApplyRecommendationModal] Workflow error:', err);
          this.isApplying.set(false);
          this.errorMessage.set(err?.message || 'Failed to connect to AI Advisor workflow pipeline.');
        }
      });
  }

  async applyAiChanges(): Promise<void> {
    const goal = this.activeGoal();
    if (!goal) return;

    const currentBoost = this.boostAmount();
    this.isApplying.set(true);
    try {
      const alloc = this.currentAllocation();
      await this.goalsService.applyRecommendation(
        goal.id,
        currentBoost,
        this.selectedStrategy,
        this.recommendationResult() || undefined,
        alloc
      );
      this.goalsService.showToast(`Applied AI Changes to "${goal.title}"! Monthly savings increased by ₹${currentBoost.toLocaleString('en-IN')}.`);
      this.close();
      this.router.navigate(['/goals']);
    } catch (err) {
      console.error('Error applying AI change to goal:', err);
    } finally {
      this.isApplying.set(false);
    }
  }

  openInAiAdvisor(): void {
    this.close();
    this.router.navigate(['/ai-advisor']);
  }
}

