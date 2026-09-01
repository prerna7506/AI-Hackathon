import { Component, inject, OnInit, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { BudgetService } from '../../services/budget.service';
import { FirestoreService, FinancialDecisionRecord, SimulatorHistoryRecord } from '../../services/firestore.service';

export interface UnifiedHistoryItem {
  id: string;
  source: 'advisor' | 'simulator';
  title: string;
  query: string;
  costOrAmount?: string;
  score: number;
  scoreCategory: string;
  verdict: string;
  metricsSubtitle: string;
  timestamp: string;
  rawItem: any;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class DashboardComponent implements OnInit {
  authService = inject(AuthService);
  budgetService = inject(BudgetService);
  private firestoreService = inject(FirestoreService);
  private router = inject(Router);

  // Financial Health Metrics
  healthScore = 78;
  healthStatus = 'Strong Standing';
  healthPointsChange = '+6 pts this month';

  income = '₹1,50,000';
  expenses = '₹65,000';
  expenseChange = 'Expenses down 8% vs last month';

  savings = '₹6,00,000';
  savingsYtd = '↑ 14.2% YTD';

  activeLoans = '₹8,500';
  autoLoan = '₹8,500';
  nextLoanPayment = 'Next: ₹450 on 15th';

  downpaymentProgress = 70;
  downpaymentStatus = '12% ahead of schedule';

  // Active History Filter Tab
  activeFilter: 'all' | 'advisor' | 'simulator' = 'all';

  // History Collections
  recentAdvisorDecisions: FinancialDecisionRecord[] = [];
  recentSimulations: SimulatorHistoryRecord[] = [];
  isLoadingHistory = false;

  get userName(): string {
    const profile = this.authService.userProfile();
    if (profile && profile.name) {
      return profile.name.split(' ')[0];
    }
    return 'Friend';
  }

  constructor() {
    effect(() => {
      const uid = this.authService.currentUserId();
      untracked(() => {
        this.loadHistory(uid);
      });
    });
  }

  ngOnInit(): void {
    this.loadHistory(this.authService.currentUserId());
  }

  async loadHistory(uid: string | null): Promise<void> {
    this.isLoadingHistory = true;

    // 1. Read from localStorage cache
    try {
      const localDecisions = JSON.parse(localStorage.getItem('finmate_assessed_decisions') || '[]');
      const localSims = JSON.parse(localStorage.getItem('finmate_simulator_history') || '[]');

      if (Array.isArray(localDecisions) && localDecisions.length > 0) {
        this.recentAdvisorDecisions = localDecisions;
      }
      if (Array.isArray(localSims) && localSims.length > 0) {
        this.recentSimulations = localSims;
      }
    } catch (e) {
      console.warn('Could not read local history cache', e);
    }

    // Default sample entries if empty
    if (this.recentAdvisorDecisions.length === 0) {
      this.recentAdvisorDecisions = [
        {
          id: 'dec-1',
          decisionType: 'Car Purchase (₹8 Lakh)',
          cost: '₹8,00,000',
          affordabilityScore: 82,
          scoreCategory: 'Healthy & Comfortable',
          verdictText: 'Healthy purchase with minimal debt exposure and comfortable EMI coverage.',
          userQuery: 'Can I afford a car for ₹8 Lakh?',
          timestamp: 'Today'
        },
        {
          id: 'dec-2',
          decisionType: 'iPhone 16 Pro (₹1.5 Lakh)',
          cost: '₹1,50,000',
          affordabilityScore: 92,
          scoreCategory: 'Healthy & Comfortable',
          verdictText: 'Well within discretionary liquid savings buffer.',
          userQuery: 'Can I buy an iPhone for ₹1.5 Lakh?',
          timestamp: 'Yesterday'
        }
      ];
    }

    if (this.recentSimulations.length === 0) {
      this.recentSimulations = [
        {
          id: 'sim-1',
          scenarioId: 'job_loss',
          scenarioTitle: 'Job Loss Stress Test',
          score: 100,
          status: 'Well Prepared',
          monthlyExpenses: 65000,
          accessibleSavings: 600000,
          totalAssets: 3425000,
          backupMonths: 9.2,
          shortfall: 0,
          timestamp: 'Today'
        },
        {
          id: 'sim-2',
          scenarioId: 'medical_emergency',
          scenarioTitle: 'Medical Bill Shock Test',
          score: 85,
          status: 'Mostly Prepared',
          monthlyExpenses: 65000,
          accessibleSavings: 600000,
          totalAssets: 3425000,
          backupMonths: 9.2,
          shortfall: 0,
          timestamp: '2 days ago'
        }
      ];
    }

    // 2. If logged in, fetch live Firestore history
    if (uid) {
      try {
        const [cloudDecisions, cloudSims] = await Promise.all([
          this.firestoreService.loadUserDecisions(uid),
          this.firestoreService.loadSimulatorRecords(uid)
        ]);

        if (cloudDecisions.length > 0) this.recentAdvisorDecisions = cloudDecisions;
        if (cloudSims.length > 0) this.recentSimulations = cloudSims;
      } catch (err) {
        console.warn('Could not sync history from Firestore:', err);
      }
    }

    this.isLoadingHistory = false;
  }

  get unifiedHistory(): UnifiedHistoryItem[] {
    const list: UnifiedHistoryItem[] = [];

    // Map AI Advisor Decisions
    this.recentAdvisorDecisions.forEach(d => {
      list.push({
        id: d.id || `dec-${d.timestamp}`,
        source: 'advisor',
        title: d.decisionType,
        query: d.userQuery || `Assessed purchase of ${d.decisionType}`,
        costOrAmount: d.cost ? `${d.cost}` : undefined,
        score: d.affordabilityScore,
        scoreCategory: d.scoreCategory,
        verdict: d.verdictText,
        metricsSubtitle: `Affordability Check • ${d.cost ? 'Cost: ' + d.cost : 'Evaluated'}`,
        timestamp: d.timestamp,
        rawItem: d
      });
    });

    // Map What-If Simulations
    this.recentSimulations.forEach(s => {
      list.push({
        id: s.id,
        source: 'simulator',
        title: s.scenarioTitle,
        query: `Simulated ${s.scenarioTitle} (${s.backupMonths}m living backup, ₹${s.accessibleSavings.toLocaleString('en-IN')} cash pool)`,
        costOrAmount: s.shortfall > 0 ? `Shortfall: ₹${s.shortfall.toLocaleString('en-IN')}` : 'Zero Shortfall',
        score: s.score,
        scoreCategory: s.status,
        verdict: `Resilience test evaluated ${s.backupMonths} months emergency backup runway with ₹${s.accessibleSavings.toLocaleString('en-IN')} available liquid pool.`,
        metricsSubtitle: `What-If Stress Test • ${s.backupMonths} Months Runway`,
        timestamp: s.timestamp,
        rawItem: s
      });
    });

    if (this.activeFilter === 'advisor') {
      return list.filter(x => x.source === 'advisor');
    }
    if (this.activeFilter === 'simulator') {
      return list.filter(x => x.source === 'simulator');
    }
    return list;
  }

  openItem(item: UnifiedHistoryItem): void {
    if (item.source === 'advisor') {
      const prompt = item.rawItem.userQuery || `Can I afford ${item.title}?`;
      this.router.navigate(['/ai-advisor'], { queryParams: { prompt: prompt } });
    } else {
      this.router.navigate(['/simulator'], { queryParams: { scenario: item.rawItem.scenarioId } });
    }
  }

  get totalItemsCount(): number {
    return this.recentAdvisorDecisions.length + this.recentSimulations.length;
  }
}
