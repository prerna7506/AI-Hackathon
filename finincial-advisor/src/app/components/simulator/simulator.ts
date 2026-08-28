import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

interface ScenarioOption {
  id: string;
  title: string;
  description: string;
  selected?: boolean;
}

interface ChartPoint {
  yearLabel: string;
  currentVal: number;
  simulatedVal: number;
  cx: number;
  cyCurrent: number;
  cySimulated: number;
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
  scenarios: ScenarioOption[] = [
    {
      id: 'job_loss',
      title: 'Job Loss (6 Months)',
      description: 'If income drops to zero for 6 months, your current emergency fund will only cover half the period. You will face a liquidity shortfall starting in Month 4.',
      selected: true
    },
    {
      id: 'home_purchase',
      title: 'Home Purchase (Down Payment)',
      description: 'Lumping ₹10,00,000 down payment will reduce liquid liquidity initially, but builds long-term real estate equity.',
      selected: false
    },
    {
      id: 'sabbatical',
      title: 'Sabbatical (1 Year)',
      description: 'Taking a 1-year career break reduces annual income by 50%, delaying retirement by approx 1.5 years.',
      selected: false
    }
  ];

  monthlyIncome = 120000;
  monthlyExpenses = 75000;
  monthlySavings = 45000;

  activeHoverPoint: ChartPoint | null = null;

  get selectedScenario(): ScenarioOption {
    return this.scenarios.find(s => s.selected) || this.scenarios[0];
  }

  // Calculated Metrics
  get currentCoverageMonths(): number {
    return Math.round((225000 / Math.max(this.monthlyExpenses, 1)));
  }

  get requiredCoverageAmount(): number {
    return this.monthlyExpenses * 6;
  }

  get currentNetWorth5Yrs(): number {
    const annualSavings = this.monthlySavings * 12;
    return Math.round(annualSavings * 5 * 1.67);
  }

  get simulatedNetWorth5Yrs(): number {
    let factor = 0.85;
    if (this.selectedScenario.id === 'job_loss') factor = 0.85;
    if (this.selectedScenario.id === 'home_purchase') factor = 0.91;
    if (this.selectedScenario.id === 'sabbatical') factor = 0.78;
    return Math.round(this.currentNetWorth5Yrs * factor);
  }

  get dropPercentage(): number {
    const diff = this.currentNetWorth5Yrs - this.simulatedNetWorth5Yrs;
    return Math.round((diff / this.currentNetWorth5Yrs) * 100);
  }

  get currentGoalDate(): string {
    return 'Dec 2026';
  }

  get simulatedGoalDate(): string {
    if (this.selectedScenario.id === 'job_loss') return 'Aug 2027';
    if (this.selectedScenario.id === 'home_purchase') return 'Mar 2027';
    return 'Jan 2028';
  }

  get currentFiAge(): number {
    return 58;
  }

  get simulatedFiAge(): number {
    if (this.selectedScenario.id === 'job_loss') return 60;
    if (this.selectedScenario.id === 'home_purchase') return 59;
    return 61;
  }

  get chartPoints(): ChartPoint[] {
    const years = ['Today', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5'];
    const curTotal = this.currentNetWorth5Yrs;
    const simTotal = this.simulatedNetWorth5Yrs;
    const width = 600;
    const height = 180;
    const padX = 35;
    const padY = 25;

    return years.map((label, index) => {
      const ratio = index / (years.length - 1);
      const cx = padX + ratio * (width - padX * 2);
      
      const curVal = Math.round(curTotal * (0.12 + ratio * 0.88));
      const simRatio = index <= 1 ? ratio : (index === 2 ? 0.75 : 0.85);
      const simVal = Math.round(simTotal * (0.12 + ratio * simRatio));

      // Map values to Y coordinates (SVG height 180 -> top padY)
      const cyCurrent = height - padY - (curVal / curTotal) * (height - padY * 2);
      const cySimulated = height - padY - (simVal / curTotal) * (height - padY * 2);

      return {
        yearLabel: label,
        currentVal: curVal,
        simulatedVal: simVal,
        cx: Math.round(cx),
        cyCurrent: Math.round(cyCurrent),
        cySimulated: Math.round(cySimulated)
      };
    });
  }

  get currentPathD(): string {
    const points = this.chartPoints;
    let d = `M ${points[0].cx} ${points[0].cyCurrent}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx1 = prev.cx + (curr.cx - prev.cx) / 2;
      const cpx2 = cpx1;
      d += ` C ${cpx1} ${prev.cyCurrent}, ${cpx2} ${curr.cyCurrent}, ${curr.cx} ${curr.cyCurrent}`;
    }
    return d;
  }

  get currentAreaD(): string {
    const points = this.chartPoints;
    const pathD = this.currentPathD;
    const lastX = points[points.length - 1].cx;
    const firstX = points[0].cx;
    return `${pathD} L ${lastX} 175 L ${firstX} 175 Z`;
  }

  get simulatedPathD(): string {
    const points = this.chartPoints;
    let d = `M ${points[0].cx} ${points[0].cySimulated}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx1 = prev.cx + (curr.cx - prev.cx) / 2;
      const cpx2 = cpx1;
      d += ` C ${cpx1} ${prev.cySimulated}, ${cpx2} ${curr.cySimulated}, ${curr.cx} ${curr.cySimulated}`;
    }
    return d;
  }

  selectScenario(id: string): void {
    this.scenarios.forEach(sc => sc.selected = (sc.id === id));
  }

  resetParameters(): void {
    this.monthlyIncome = 120000;
    this.monthlyExpenses = 75000;
    this.monthlySavings = 45000;
  }

  onIncomeChange(): void {
    if (this.monthlyIncome < this.monthlyExpenses) {
      this.monthlyExpenses = Math.round(this.monthlyIncome * 0.6);
    }
    this.monthlySavings = this.monthlyIncome - this.monthlyExpenses;
  }

  onExpensesChange(): void {
    if (this.monthlyExpenses > this.monthlyIncome) {
      this.monthlyIncome = Math.round(this.monthlyExpenses * 1.3);
    }
    this.monthlySavings = this.monthlyIncome - this.monthlyExpenses;
  }
}
