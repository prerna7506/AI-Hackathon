import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
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
export class SimulatorComponent {
  authService = inject(AuthService);
  router = inject(Router);
  private simulatorService = inject(SimulatorWorkflowService);
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

  // 10 Base Parameters - Defaulted to 0
  monthlyExpenses = 0;
  jobLossMonths = 0;
  medicalBill = 0;
  bigExpense = 0;
  fdInvestment = 0;
  insurance = 0;
  liquidFund = 0;
  savingsBankBalance = 0;
  goldInvestment = 0;
  marketInvestment = 0;

  // AI Workflow State (Pipeline 21759)
  isAnalyzing = false;
  analysisResult: string | null = null;
  reportData: PreparednessReportData | null = null;
  analysisError: string | null = null;
  copiedSuccess = false;
  lastPrompt = '';

  get selectedScenario(): ScenarioOption {
    return this.scenarios.find(s => s.selected) || this.scenarios[0];
  }

  get immediateLiquidCash(): number {
    return this.savingsBankBalance + this.liquidFund;
  }

  get totalEmergencyPool(): number {
    return this.immediateLiquidCash + this.fdInvestment;
  }

  get totalInvestedAssets(): number {
    return this.fdInvestment + this.goldInvestment + this.marketInvestment;
  }

  get totalNetWorth(): number {
    return this.immediateLiquidCash + this.totalInvestedAssets;
  }

  get totalReservesCoverageMonths(): number {
    if (this.monthlyExpenses <= 0) return 0;
    return parseFloat((this.totalEmergencyPool / this.monthlyExpenses).toFixed(1));
  }

  get scenarioCost(): number {
    if (this.selectedScenario.id === 'job_loss') {
      return this.monthlyExpenses * this.jobLossMonths;
    }
    if (this.selectedScenario.id === 'medical_emergency') {
      return Math.max(0, this.medicalBill - this.insurance);
    }
    return 0;
  }

  selectScenario(id: string): void {
    this.scenarios.forEach(sc => sc.selected = (sc.id === id));
  }

  openSignInModal(): void {
    this.authService.openModal('auth');
  }

  resetParameters(): void {
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

  getCurrentParams(): any {
    return {
      monthlyExpenses: this.monthlyExpenses,
      jobLossMonths: this.jobLossMonths,
      medicalBill: this.medicalBill,
      insurance: this.insurance,
      bigExpense: this.bigExpense,
      savingsBankBalance: this.savingsBankBalance,
      liquidFund: this.liquidFund,
      fdInvestment: this.fdInvestment,
      goldInvestment: this.goldInvestment,
      marketInvestment: this.marketInvestment,
      scenarioId: this.selectedScenario.id
    };
  }

  /**
   * Formats the prompt cleanly to match the tool schema expected by Pipeline 21759
   */
  buildPrompt(): string {
    const scenarioKey = this.selectedScenario.id === 'medical_emergency' ? 'medical_bill' : this.selectedScenario.id;

    return `I would like to check my financial preparedness for the following situation:

Scenario: ${scenarioKey}
• Monthly Expenses: ₹${this.monthlyExpenses.toLocaleString('en-IN')}
• Job Loss Months: ${this.jobLossMonths > 0 ? this.jobLossMonths : (this.selectedScenario.id === 'job_loss' ? 6 : 0)}
• Medical Bill: ₹${this.medicalBill.toLocaleString('en-IN')}
• Insurance: ₹${this.insurance.toLocaleString('en-IN')}
• Big Expense: ₹${this.bigExpense.toLocaleString('en-IN')}
• Savings Bank Account Balance: ₹${this.savingsBankBalance.toLocaleString('en-IN')}
• Liquid Fund: ₹${this.liquidFund.toLocaleString('en-IN')}
• FD Investment: ₹${this.fdInvestment.toLocaleString('en-IN')}
• Gold Investment: ₹${this.goldInvestment.toLocaleString('en-IN')}
• Market Investment: ₹${this.marketInvestment.toLocaleString('en-IN')}

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

    this.simulatorService.runWorkflowAndAwaitResult(prompt).subscribe({
      next: (response) => {
        const text = this.simulatorService.extractReplyText(response, currentParams);
        this.analysisResult = text;
        this.reportData = this.simulatorService.buildStructuredReport(currentParams, text);
        this.isAnalyzing = false;
        this.cdr.markForCheck();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Simulator Pipeline 21759 error:', err);
        const fallbackText = this.simulatorService.generateCalculationReport(currentParams);
        this.analysisResult = fallbackText;
        this.reportData = this.simulatorService.buildStructuredReport(currentParams, fallbackText);
        this.isAnalyzing = false;
        this.cdr.markForCheck();
        this.cdr.detectChanges();
      }
    });
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
}
