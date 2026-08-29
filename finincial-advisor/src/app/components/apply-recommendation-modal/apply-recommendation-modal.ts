import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GoalsService } from '../../services/goals.service';

@Component({
  selector: 'app-apply-recommendation-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './apply-recommendation-modal.html',
  styleUrl: './apply-recommendation-modal.scss'
})
export class ApplyRecommendationModalComponent {
  goalsService = inject(GoalsService);

  // Default suggested monthly boost amount
  boostAmount = 5000;
  selectedStrategy = 'growth'; // 'growth' | 'balanced' | 'safe'
  isApplying = signal(false);

  quickAmounts = [
    { label: '+₹2,500', value: 2500 },
    { label: '+₹5,000 (Recommended)', value: 5000 },
    { label: '+₹10,000', value: 10000 },
    { label: '+₹15,000', value: 15000 }
  ];

  strategies = [
    {
      id: 'growth',
      name: 'High Growth SIP',
      desc: '70% Equity Index + 30% Flexi-Cap',
      expectedReturn: '12-14% p.a.',
      badge: 'Recommended'
    },
    {
      id: 'balanced',
      name: 'Balanced Advantage',
      desc: '50% Large Cap Equity + 50% High Yield Debt',
      expectedReturn: '9-11% p.a.',
      badge: 'Moderate'
    },
    {
      id: 'safe',
      name: 'Capital Preservation',
      desc: '30% Bluechip + 70% Liquid & Sovereign Bonds',
      expectedReturn: '7-8.5% p.a.',
      badge: 'Low Risk'
    }
  ];

  activeGoal = computed(() => {
    const goals = this.goalsService.goals();
    return goals.find(g => g.isPrimary) || goals[0] || null;
  });

  // Calculate estimated impact dynamically
  estimatedMonthsSaved = computed(() => {
    const boost = this.boostAmount;
    if (boost >= 15000) return 14;
    if (boost >= 10000) return 10;
    if (boost >= 5000) return 6;
    return 3;
  });

  estimatedGains = computed(() => {
    const boost = this.boostAmount;
    const years = this.activeGoal()?.timelineYears || 5;
    const totalAddedPrincipal = boost * 12 * years;
    const estimatedInterest = Math.round(totalAddedPrincipal * 0.35);
    return '₹' + estimatedInterest.toLocaleString('en-IN');
  });

  selectQuickAmount(amount: number): void {
    this.boostAmount = amount;
  }

  close(): void {
    this.goalsService.closeRecommendationModal();
  }

  async onApply(): Promise<void> {
    const goal = this.activeGoal();
    if (!goal) return;

    this.isApplying.set(true);

    try {
      await this.goalsService.applyRecommendation(
        goal.id,
        this.boostAmount,
        this.selectedStrategy
      );
    } finally {
      this.isApplying.set(false);
    }
  }
}
