import { Component, inject, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { FirestoreService, SimulatorHistoryRecord } from '../../services/firestore.service';
import { SimulatorWorkflowService, PreparednessReportData } from '../../services/simulator-advisor.service';

export interface ScenarioOption {
  id: string;
  title: string;
  category: string;
  badge: string;
  description: string;
  selected?: boolean;
}

@Component({
  selector: 'app-simulator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './simulator.html',
  styleUrl: './simulator.scss'
})
export class SimulatorComponent implements OnDestroy {
  authService = inject(AuthService);
  router = inject(Router);
  private simulatorService = inject(SimulatorWorkflowService);
  private firestoreService = inject(FirestoreService);
  private cdr = inject(ChangeDetectorRef);

  protected readonly Math = Math;

  // 2 Quick Scenarios
  scenarios: ScenarioOption[] = [
    {
      id: 'job_loss',
      title: 'Job Loss',
      category: 'Income Shock',
      badge: 'High Impact',
      description: 'Simulate losing your primary income stream. Evaluates how long your emergency cash and fixed deposits sustain your lifestyle before requiring market liquidations.',
      selected: true
    },
    {
      id: 'medical_emergency',
      title: 'Medical Emergency',
      category: 'Health Event',
      badge: 'Protection Test',
      description: 'Simulate a major medical event with substantial hospitalization costs. Tests whether your health insurance covers the bill and calculates out-of-pocket cash drain.',
      selected: false
    }
  ];

  // 10 Base Parameters - Defaulted to sensible starting numbers for immediate interactivity
  monthlyExpenses = 65000;
  jobLossMonths = 6;
  medicalBill = 400000;
  bigExpense = 0;
  fdInvestment = 300000;
  insurance = 500000;
  liquidFund = 400000;
  savingsBankBalance = 200000;
  goldInvestment = 150000;
  marketInvestment = 1200000;

  // AI Workflow State (Pipeline 21759 - Single AAVA Agent)
  isAnalyzing = false;
  analysisResult: string | null = null;
  reportData: PreparednessReportData | null = null;
  analysisError: string | null = null;
  copiedSuccess = false;
  lastPrompt = '';
  analysisSeconds = 0;
  private timerInterval: any = null;

  get selectedScenario(): ScenarioOption {
    return this.scenarios.find(s => s.selected) || this.scenarios[0];
  }

  get immediateLiquidCash(): number {
    return (Number(this.savingsBankBalance) || 0) + (Number(this.liquidFund) || 0);
  }

  get totalEmergencyPool(): number {
    return this.immediateLiquidCash + (Number(this.fdInvestment) || 0);
  }

  get totalInvestedAssets(): number {
    return (Number(this.fdInvestment) || 0) + (Number(this.goldInvestment) || 0) + (Number(this.marketInvestment) || 0);
  }

  get totalNetWorth(): number {
    return this.immediateLiquidCash + this.totalInvestedAssets;
  }

  get totalReservesCoverageMonths(): number {
    const expenses = Number(this.monthlyExpenses) || 0;
    if (expenses <= 0) return 0;
    return parseFloat((this.immediateLiquidCash / expenses).toFixed(1));
  }

  get scenarioCost(): number {
    if (this.selectedScenario.id === 'job_loss') {
      return (Number(this.monthlyExpenses) || 0) * (Number(this.jobLossMonths) || 0);
    }
    if (this.selectedScenario.id === 'medical_emergency') {
      return Math.max(0, (Number(this.medicalBill) || 0) - (Number(this.insurance) || 0));
    }
    return 0;
  }

  selectScenario(id: string): void {
    if (this.isAnalyzing) return;
    this.scenarios.forEach(sc => sc.selected = (sc.id === id));
    this.reportData = null;
    this.analysisResult = null;
  }

  openSignInModal(): void {
    this.authService.openModal('auth');
  }

  resetParameters(): void {
    if (this.isAnalyzing) return;
    this.monthlyExpenses = 0;
    this.jobLossMonths = 0;
    this.medicalBill = 0;
    this.bigExpense = 0;
    this.fdInvestment = 0;
    this.insurance = 0;
    this.liquidFund = 0;
    this.savingsBankBalance = 0;
    this.goldInvestment = 0;
    this.marketInvestment = 0;
    this.reportData = null;
    this.analysisResult = null;
  }

  loadDemoPreset(): void {
    if (this.isAnalyzing) return;
    this.monthlyExpenses = 65000;
    this.jobLossMonths = 6;
    this.medicalBill = 450000;
    this.insurance = 500000;
    this.savingsBankBalance = 250000;
    this.liquidFund = 350000;
    this.fdInvestment = 400000;
    this.goldInvestment = 200000;
    this.marketInvestment = 1500000;
    this.reportData = null;
    this.analysisResult = null;
  }

  getCurrentParams(): any {
    return {
      monthlyExpenses: Number(this.monthlyExpenses) || 0,
      jobLossMonths: Number(this.jobLossMonths) || 0,
      medicalBill: Number(this.medicalBill) || 0,
      insurance: Number(this.insurance) || 0,
      bigExpense: Number(this.bigExpense) || 0,
      savingsBankBalance: Number(this.savingsBankBalance) || 0,
      liquidFund: Number(this.liquidFund) || 0,
      fdInvestment: Number(this.fdInvestment) || 0,
      goldInvestment: Number(this.goldInvestment) || 0,
      marketInvestment: Number(this.marketInvestment) || 0,
      scenarioId: this.selectedScenario.id
    };
  }

  /**
   * Helper for dynamic slider gradient track fill
   */
  getSliderPercentage(value: number, max: number): number {
    if (!max || max <= 0) return 0;
    return Math.min(100, Math.max(0, (value / max) * 100));
  }

  buildPrompt(): string {
    const scenarioKey = this.selectedScenario.id === 'medical_emergency' ? 'medical_bill' : this.selectedScenario.id;
    const exp = Number(this.monthlyExpenses) || 0;
    const months = Number(this.jobLossMonths) || 0;
    const med = Number(this.medicalBill) || 0;
    const ins = Number(this.insurance) || 0;
    const big = Number(this.bigExpense) || 0;
    const sav = Number(this.savingsBankBalance) || 0;
    const liq = Number(this.liquidFund) || 0;
    const fd = Number(this.fdInvestment) || 0;
    const gold = Number(this.goldInvestment) || 0;
    const mkt = Number(this.marketInvestment) || 0;

    return `I would like to check my financial preparedness for the following situation:

Scenario: ${scenarioKey}
• Monthly Expenses: ₹${exp.toLocaleString('en-IN')}
• Job Loss Months: ${months > 0 ? months : (this.selectedScenario.id === 'job_loss' ? 6 : 0)}
• Medical Bill: ₹${med.toLocaleString('en-IN')}
• Insurance: ₹${ins.toLocaleString('en-IN')}
• Big Expense: ₹${big.toLocaleString('en-IN')}
• Savings Bank Account Balance: ₹${sav.toLocaleString('en-IN')}
• Liquid Fund: ₹${liq.toLocaleString('en-IN')}
• FD Investment: ₹${fd.toLocaleString('en-IN')}
• Gold Investment: ₹${gold.toLocaleString('en-IN')}
• Market Investment: ₹${mkt.toLocaleString('en-IN')}

Please evaluate my preparedness score, required amount, accessible savings, safety backup runway in months, potential shortfall, and recommendation using the Financial Preparedness Advisor.`;
  }

  analyzeWithAava(): void {
    const prompt = this.buildPrompt();
    const currentParams = this.getCurrentParams();
    this.lastPrompt = prompt;
    this.isAnalyzing = true;
    this.analysisResult = null;
    this.reportData = null;
    this.analysisError = null;
    this.analysisSeconds = 0;

    // Start timer for single-agent live computation feedback
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.analysisSeconds++;
      this.cdr.detectChanges();
    }, 1000);

    this.simulatorService.runWorkflowAndAwaitResult(prompt).subscribe({
      next: (response) => {
        this.stopTimer();
        const text = this.simulatorService.extractReplyText(response, currentParams);
        this.analysisResult = text;
        const rep = this.simulatorService.buildStructuredReport(currentParams, text);
        this.reportData = rep;
        this.isAnalyzing = false;
        this.saveRecord(rep);
        this.cdr.markForCheck();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.stopTimer();
        console.warn('Simulator Pipeline 21759 error, using quantitative engine:', err);
        const fallbackText = this.simulatorService.generateCalculationReport(currentParams);
        this.analysisResult = fallbackText;
        const rep = this.simulatorService.buildStructuredReport(currentParams, fallbackText);
        this.reportData = rep;
        this.isAnalyzing = false;
        this.saveRecord(rep);
        this.cdr.markForCheck();
        this.cdr.detectChanges();
      }
    });
  }

  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private saveRecord(rep: PreparednessReportData): void {
    const record: SimulatorHistoryRecord = {
      id: `sim-${Date.now()}`,
      scenarioId: this.selectedScenario.id,
      scenarioTitle: `${this.selectedScenario.title} Stress Test`,
      score: rep.score,
      status: rep.status,
      monthlyExpenses: Number(this.monthlyExpenses) || 0,
      accessibleSavings: rep.accessibleSavings,
      totalAssets: rep.totalAssets,
      backupMonths: rep.backupMonths,
      shortfall: rep.shortfall,
      timestamp: 'Just now'
    };

    // Save to localStorage
    try {
      const existing = JSON.parse(localStorage.getItem('finmate_simulator_history') || '[]');
      existing.unshift(record);
      localStorage.setItem('finmate_simulator_history', JSON.stringify(existing.slice(0, 20)));
    } catch {}

    // If logged in, persist to Firestore
    const uid = this.authService.currentUserId();
    if (uid) {
      this.firestoreService.saveSimulatorRecord(uid, record);
    }
  }

  copyAnalysis(): void {
    if (this.analysisResult) {
      navigator.clipboard.writeText(this.analysisResult);
      this.copiedSuccess = true;
      setTimeout(() => (this.copiedSuccess = false), 2500);
    }
  }

  continueInChat(): void {
    this.router.navigate(['/ai-advisor'], { queryParams: { prompt: this.lastPrompt, pipelineId: '21759' } });
  }

  ngOnDestroy(): void {
    this.stopTimer();
  }
}
