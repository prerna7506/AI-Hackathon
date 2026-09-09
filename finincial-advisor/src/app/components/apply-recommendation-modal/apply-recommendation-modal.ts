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

  // Dynamic monthly boost amount signal, current monthly savings & custom allocations
  boostAmount = signal<number>(5000);
  currentMonthlySavings = signal<number>(30000);
  customEquity = signal<number>(50);
  customDebt = signal<number>(40);
  customLiquid = signal<number>(10);
  selectedStrategy = 'balanced';
  showCustomParams = signal<boolean>(false);
  
  viewMode = signal<'loading' | 'result'>('loading');
  isApplying = signal(false);
  loadingStep = signal('Submitting goal parameters to AI Goal Advisor...');
  recommendationResult = signal<string | null>(null);
  errorMessage = signal<string | null>(null);

  activeGoal = computed(() => {
    const goals = this.goalsService.goals();
    return goals.find(g => g.isPrimary) || goals[0] || null;
  });

  currentAllocation = computed(() => {
    return {
      equity: Number(this.customEquity()) || 0,
      debt: Number(this.customDebt()) || 0,
      liquid: Number(this.customLiquid()) || 0
    };
  });

  smartAllocation = computed(() => {
    const goal = this.activeGoal();
    return this.goalsService.calculateSmartAllocation(goal, this.currentAllocation());
  });

  financials = computed(() => {
    const goal = this.activeGoal();
    return this.goalsService.calculateGoalFinancials(
      goal,
      this.currentAllocation(),
      this.currentMonthlySavings()
    );
  });

  totalAllocation = computed(() => {
    return this.currentAllocation().equity + this.currentAllocation().debt + this.currentAllocation().liquid;
  });

  constructor() {
    // When modal opens, sync dynamic boost, current monthly savings, and allocations
    effect(() => {
      const isOpen = this.goalsService.isRecommendationModalOpen();
      const goal = this.activeGoal();
      const alloc = this.smartAllocation();

      untracked(() => {
        if (isOpen && goal) {
          // Initialize dynamic current monthly savings from goal metrics or default
          const curMonthly = goal.monthlySavings && goal.monthlySavings > 0
            ? goal.monthlySavings
            : 30000;
          this.currentMonthlySavings.set(curMonthly);

          // Calculate fresh dynamic financials with current allocation and monthly savings
          const fin = this.goalsService.calculateGoalFinancials(goal, alloc, curMonthly);

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
            this.recommendationResult.set(null);
            this.runAnalysis();
          }
        }
      });
    });
  }

  setBoostPreset(amount: number): void {
    this.boostAmount.set(amount);
  }

  setCurrentSavingsPreset(amount: number): void {
    this.currentMonthlySavings.set(amount);
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
    this.recommendationResult.set(null);
    this.showCustomParams.set(false);
    this.goalsService.closeRecommendationModal();
  }

  /**
   * Helper to parse AI recommended monthly boost from workflow text response
   */
  private extractAiBoostAmount(text: string): number | null {
    if (!text) return null;
    
    // 1. Matches: Recommended Monthly Increase: ₹25,000 or +₹25,000
    const boostMatch = text.match(/(?:Recommended Monthly Increase|Monthly Increase|Monthly Action)[^0-9\r\n]*([0-9,]+)/i);
    if (boostMatch) {
      const num = parseInt(boostMatch[1].replace(/,/g, ''), 10);
      if (!isNaN(num) && num > 0) return num;
    }

    // 2. Matches: Increase monthly savings by INR 25,000 or ₹25,000
    const actionMatch = text.match(/Increase\s+(?:your\s+)?monthly\s+savings\s+by\s+(?:INR|₹)?\s*([0-9,]+)/i);
    if (actionMatch) {
      const num = parseInt(actionMatch[1].replace(/,/g, ''), 10);
      if (!isNaN(num) && num > 0) return num;
    }

    // 3. Matches: +₹25,000 / mo or +₹25,000/mo
    const plusMatch = text.match(/\+\s*(?:INR|₹)?\s*([0-9,]+)\s*(?:\/|\s*per)\s*mo/i);
    if (plusMatch) {
      const num = parseInt(plusMatch[1].replace(/,/g, ''), 10);
      if (!isNaN(num) && num > 0) return num;
    }

    return null;
  }

  runAnalysis(): void {
    const goal = this.activeGoal();
    if (!goal) return;

    // Reset old recommendation state completely before analyzing
    this.recommendationResult.set(null);
    this.showCustomParams.set(false);

    const alloc = this.currentAllocation();
    const curSavings = Number(this.currentMonthlySavings()) || 0;
    const dynamicFin = this.goalsService.calculateGoalFinancials(goal, alloc, curSavings);
    const currentBoost = dynamicFin.recommendedMonthlyBoost;

    this.isApplying.set(true);
    this.viewMode.set('loading');
    this.errorMessage.set(null);
    this.loadingStep.set('Submitting goal parameters to AI Goal Advisor...');

    setTimeout(() => {
      if (this.isApplying()) {
        this.loadingStep.set('Evaluating timeline & investment allocation risk...');
      }
    }, 2000);

    setTimeout(() => {
      if (this.isApplying()) {
        this.loadingStep.set('Finalizing AI goal optimization recommendations...');
      }
    }, 4000);

    this.goalsService
      .runGoalRecommendationWorkflow(goal, currentBoost, this.selectedStrategy, alloc, curSavings)
      .subscribe({
        next: async (res) => {
          this.isApplying.set(false);
          this.recommendationResult.set(res.replyText);
          this.viewMode.set('result');

          // Extract dynamic AI boost from the agent's response text if present
          const parsedAiBoost = this.extractAiBoostAmount(res.replyText);
          const effectiveBoost = (parsedAiBoost !== null && parsedAiBoost >= 0)
            ? parsedAiBoost
            : this.financials().recommendedMonthlyBoost;

          // Update local boost input and header immediately to reflect what AI recommended
          this.boostAmount.set(effectiveBoost);

          // Cache recommendation response and update goal's monthlyBoost so outer cards match AI result
          await this.goalsService.applyRecommendation(
            goal.id,
            effectiveBoost,
            this.selectedStrategy,
            res.replyText,
            alloc,
            curSavings
          );
        },
        error: (err) => {
          console.error('[ApplyRecommendationModal] Workflow error:', err);
          this.isApplying.set(false);
          this.errorMessage.set(err?.message || 'Failed to connect to AI Goal Advisor.');
        }
      });
  }

  async applyAiChanges(): Promise<void> {
    const goal = this.activeGoal();
    if (!goal) return;

    const currentBoost = this.boostAmount();
    const curSavings = Number(this.currentMonthlySavings()) || 0;
    this.isApplying.set(true);
    try {
      const alloc = this.currentAllocation();
      await this.goalsService.applyRecommendation(
        goal.id,
        currentBoost,
        this.selectedStrategy,
        this.recommendationResult() || undefined,
        alloc,
        curSavings
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
}

