import { Component, inject, computed, signal, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { GoalsService, GoalItem } from '../../services/goals.service';
import { MarkdownPipe } from '../../pipes/markdown.pipe';

@Component({
  selector: 'app-apply-recommendation-modal',
  standalone: true,
  imports: [CommonModule, MarkdownPipe],
  templateUrl: './apply-recommendation-modal.html',
  styleUrl: './apply-recommendation-modal.scss'
})
export class ApplyRecommendationModalComponent {
  goalsService = inject(GoalsService);
  private router = inject(Router);

  // Suggested monthly boost amount & allocation
  boostAmount = 5000;
  selectedStrategy = 'balanced';
  
  viewMode = signal<'loading' | 'result'>('loading');
  isApplying = signal(false);
  loadingStep = signal('Submitting goal data to Pipeline 22027...');
  recommendationResult = signal<string | null>(null);
  errorMessage = signal<string | null>(null);

  activeGoal = computed(() => {
    const goals = this.goalsService.goals();
    return goals.find(g => g.isPrimary) || goals[0] || null;
  });

  currentAllocation = computed(() => {
    return {
      equity: 50,
      debt: 40,
      liquid: 10
    };
  });

  constructor() {
    // When modal opens, auto-run analysis if no cached result, or show cached result
    effect(() => {
      const isOpen = this.goalsService.isRecommendationModalOpen();
      const goal = this.activeGoal();

      untracked(() => {
        if (isOpen && goal) {
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

  close(): void {
    this.errorMessage.set(null);
    this.goalsService.closeRecommendationModal();
  }

  runAnalysis(): void {
    const goal = this.activeGoal();
    if (!goal) return;

    this.isApplying.set(true);
    this.viewMode.set('loading');
    this.errorMessage.set(null);
    this.loadingStep.set('Submitting goal data to Pipeline 22027 (Goal Advisor)...');

    const alloc = this.currentAllocation();

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
      .runGoalRecommendationWorkflow(goal, this.boostAmount, this.selectedStrategy, alloc)
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

    this.isApplying.set(true);
    try {
      const alloc = this.currentAllocation();
      await this.goalsService.applyRecommendation(
        goal.id,
        this.boostAmount,
        this.selectedStrategy,
        this.recommendationResult() || undefined,
        alloc
      );
      this.goalsService.showToast(`Applied AI Changes to "${goal.title}"! Monthly savings increased by ₹${this.boostAmount.toLocaleString('en-IN')}.`);
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
