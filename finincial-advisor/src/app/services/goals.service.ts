import { Injectable, signal, inject, effect, untracked } from '@angular/core';
import { Observable, map, of, catchError } from 'rxjs';
import { AuthService } from './auth.service';
import { FirestoreService, GoalItem } from './firestore.service';
import { WorkflowService } from './ai-advisor.service';

export type { GoalItem };

export interface GoalAllocation {
  equity: number;
  debt: number;
  liquid: number;
  riskProfile: string;
  expectedAnnualReturn: number;
}

export interface GoalFinancials {
  requiredMonthlySavings: number;
  currentMonthlySavings: number;
  recommendedMonthlyBoost: number;
  monthlyShortfall: number;
  projectedMaturityAmount: number;
  timelineYears: number;
  remainingAmount: number;
  monthsRemaining: number;
  expectedAnnualReturn: number;
  isAheadOfTarget: boolean;
  formattedTarget: string;
  formattedSaved: string;
  formattedCurrentMonthly: string;
  formattedRequiredMonthly: string;
  formattedRecommendedBoost: string;
  formattedProjectedMaturity: string;
}

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
    liquidAllocation: 10,
    monthlySavings: 30000
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
    liquidAllocation: 5,
    monthlySavings: 20000
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
    liquidAllocation: 60,
    monthlySavings: 25000
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
   * Dynamically calculates smart asset allocation based on the goal's timeline & category
   * Accepts optional customAlloc to allow live calculation as user adjusts sliders/inputs
   */
  calculateSmartAllocation(
    goal?: Partial<GoalItem> | null,
    customAlloc?: { equity: number; debt: number; liquid: number }
  ): GoalAllocation {
    // If custom allocation is explicitly provided (e.g. from sliders/inputs in modal)
    if (customAlloc && (customAlloc.equity + customAlloc.debt + customAlloc.liquid > 0)) {
      const eq = Number(customAlloc.equity) || 0;
      const db = Number(customAlloc.debt) || 0;
      const lq = Number(customAlloc.liquid) || 0;
      const expReturn = Number(((eq * 12 + db * 7 + lq * 4.5) / 100).toFixed(2));
      let risk = 'Balanced Growth';
      if (eq >= 70) risk = 'Aggressive Wealth Creation';
      else if (eq >= 60) risk = 'High Growth';
      else if (eq >= 40) risk = 'Balanced Growth';
      else if (eq >= 25) risk = 'Moderate (Stability Focus)';
      else risk = 'Capital Preservation / Low Risk';

      return {
        equity: eq,
        debt: db,
        liquid: lq,
        riskProfile: risk,
        expectedAnnualReturn: expReturn
      };
    }

    if (!goal) {
      return {
        equity: 50,
        debt: 40,
        liquid: 10,
        riskProfile: 'Balanced Growth',
        expectedAnnualReturn: 9.25
      };
    }

    // If goal already has custom or persisted allocation percentages
    if (
      goal.equityAllocation != null &&
      goal.debtAllocation != null &&
      goal.liquidAllocation != null &&
      (goal.equityAllocation + goal.debtAllocation + goal.liquidAllocation > 0)
    ) {
      const eq = Number(goal.equityAllocation) || 0;
      const db = Number(goal.debtAllocation) || 0;
      const lq = Number(goal.liquidAllocation) || 0;
      const expReturn = Number(((eq * 12 + db * 7 + lq * 4.5) / 100).toFixed(2));
      let risk = 'Balanced Growth';
      if (eq >= 70) risk = 'Aggressive Wealth Creation';
      else if (eq >= 60) risk = 'High Growth';
      else if (eq >= 40) risk = 'Balanced Growth';
      else if (eq >= 25) risk = 'Moderate (Stability Focus)';
      else risk = 'Capital Preservation / Low Risk';

      return {
        equity: eq,
        debt: db,
        liquid: lq,
        riskProfile: risk,
        expectedAnnualReturn: expReturn
      };
    }

    const timeline = Number(goal.timelineYears) || 3;
    const icon = goal.icon || 'house';

    if (icon === 'shield' || timeline <= 1) {
      return {
        equity: 10,
        debt: 30,
        liquid: 60,
        riskProfile: 'Capital Preservation / Low Risk',
        expectedAnnualReturn: 5.2
      };
    }

    if (timeline <= 3) {
      return {
        equity: 30,
        debt: 50,
        liquid: 20,
        riskProfile: 'Moderate (Stability Focus)',
        expectedAnnualReturn: 8.0
      };
    }

    if (timeline <= 7) {
      return {
        equity: 50,
        debt: 40,
        liquid: 10,
        riskProfile: 'Balanced Growth',
        expectedAnnualReturn: 9.25
      };
    }

    if (timeline <= 12) {
      return {
        equity: 65,
        debt: 25,
        liquid: 10,
        riskProfile: 'High Growth',
        expectedAnnualReturn: 10.0
      };
    }

    return {
      equity: 70,
      debt: 25,
      liquid: 5,
      riskProfile: 'Aggressive Wealth Creation',
      expectedAnnualReturn: 10.38
    };
  }

  /**
   * Dynamically calculates monthly savings requirement and AI recommended optimization boost
   * based on exact target amount, current saved amount, timeline, CURRENT MONTHLY SAVINGS,
   * and live asset allocation percentages (Equity/Debt/Liquid).
   */
  calculateGoalFinancials(
    goal?: GoalItem | null,
    alloc?: { equity: number; debt: number; liquid: number },
    currentMonthlySavings?: number
  ): GoalFinancials {
    if (!goal) {
      return {
        requiredMonthlySavings: 39500,
        currentMonthlySavings: 30000,
        recommendedMonthlyBoost: 9500,
        monthlyShortfall: 9500,
        projectedMaturityAmount: 4268000,
        timelineYears: 5,
        remainingAmount: 3750000,
        monthsRemaining: 60,
        expectedAnnualReturn: 9.25,
        isAheadOfTarget: false,
        formattedTarget: '₹50,00,000',
        formattedSaved: '₹12,50,000',
        formattedCurrentMonthly: '₹30,000',
        formattedRequiredMonthly: '₹39,500',
        formattedRecommendedBoost: '₹9,500',
        formattedProjectedMaturity: '₹42,68,000'
      };
    }

    const target = Math.max(0, Number(goal.targetAmount) || 0);
    const current = Math.max(0, Number(goal.currentAmount) || 0);
    const timeline = Math.max(1, Number(goal.timelineYears) || 1);
    const months = timeline * 12;
    const remaining = Math.max(0, target - current);

    // 1. Current Monthly Savings
    let curMonthly = currentMonthlySavings !== undefined
      ? Number(currentMonthlySavings)
      : (goal.monthlySavings !== undefined ? Number(goal.monthlySavings) : 0);

    // Default baseline if uninitialized
    if (curMonthly <= 0 && remaining > 0) {
      curMonthly = Math.max(2000, Math.round((remaining / months) * 0.7 / 500) * 500);
    }

    // 2. Dynamic Asset Allocation & Blended Return Rate
    const smartAlloc = this.calculateSmartAllocation(goal, alloc);
    const annualRate = smartAlloc.expectedAnnualReturn;
    const monthlyRate = (annualRate / 100) / 12;

    // 3. Compounded Future Value of Current Lump Sum Saved
    const fvExisting = current * Math.pow(1 + monthlyRate, months);
    const gapAtMaturity = Math.max(0, target - fvExisting);

    // 4. Monthly Compounding Annuity Factor (SIP annuity due at beginning of month)
    const annuityFactor = monthlyRate > 0
      ? ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) * (1 + monthlyRate)
      : months;

    // 5. Total Required Monthly Savings to reach target
    let reqMonthly = 0;
    if (gapAtMaturity > 0 && annuityFactor > 0) {
      reqMonthly = Math.round(gapAtMaturity / annuityFactor);
    } else if (gapAtMaturity === 0 && current < target) {
      reqMonthly = 0;
    } else if (remaining > 0) {
      reqMonthly = Math.round(remaining / months);
    }

    // Clean rounding for required monthly contribution
    if (reqMonthly > 10000) {
      reqMonthly = Math.round(reqMonthly / 500) * 500;
    } else if (reqMonthly > 1000) {
      reqMonthly = Math.round(reqMonthly / 100) * 100;
    } else if (reqMonthly > 0) {
      reqMonthly = Math.round(reqMonthly / 50) * 50;
    }

    // 6. Projected Maturity Amount if user continues current monthly savings
    const fvCurrentSavings = curMonthly * annuityFactor;
    const projectedMaturity = Math.round(fvExisting + fvCurrentSavings);

    // 7. Monthly Shortfall & AI Recommended Boost
    const shortfall = Math.max(0, reqMonthly - curMonthly);
    const isAhead = curMonthly >= reqMonthly;

    let boost = 0;
    if (!isAhead) {
      boost = shortfall;
      if (boost >= 10000) {
        boost = Math.round(boost / 500) * 500;
      } else if (boost >= 1000) {
        boost = Math.round(boost / 100) * 100;
      } else {
        boost = Math.max(500, Math.round(boost / 50) * 50);
      }
    } else {
      boost = 0;
    }

    return {
      requiredMonthlySavings: reqMonthly,
      currentMonthlySavings: curMonthly,
      recommendedMonthlyBoost: boost,
      monthlyShortfall: shortfall,
      projectedMaturityAmount: projectedMaturity,
      timelineYears: timeline,
      remainingAmount: remaining,
      monthsRemaining: months,
      expectedAnnualReturn: annualRate,
      isAheadOfTarget: isAhead,
      formattedTarget: '₹' + target.toLocaleString('en-IN'),
      formattedSaved: '₹' + current.toLocaleString('en-IN'),
      formattedCurrentMonthly: '₹' + curMonthly.toLocaleString('en-IN'),
      formattedRequiredMonthly: '₹' + reqMonthly.toLocaleString('en-IN'),
      formattedRecommendedBoost: '₹' + boost.toLocaleString('en-IN'),
      formattedProjectedMaturity: '₹' + projectedMaturity.toLocaleString('en-IN')
    };
  }

  /**
   * Builds the formatted goal information string for Pipeline 22027
   */
  buildGoalInformationString(
    goal: GoalItem,
    boostAmount?: number,
    alloc?: { equity: number; debt: number; liquid: number },
    currentMonthlySavings?: number
  ): string {
    const currentYear = new Date().getFullYear();
    const timeline = goal.timelineYears || 3;
    const targetYear = goal.targetYear || (currentYear + timeline);
    const progress = goal.targetAmount > 0
      ? Math.round((goal.currentAmount / goal.targetAmount) * 100)
      : 0;

    const dynamicAlloc = this.calculateSmartAllocation(goal, alloc);
    const dynamicFinancials = this.calculateGoalFinancials(goal, dynamicAlloc, currentMonthlySavings);
    const dynamicBoost = boostAmount !== undefined && boostAmount > 0
      ? boostAmount
      : dynamicFinancials.recommendedMonthlyBoost;

    return `Goal Name: ${goal.title}
Target Amount: ₹${goal.targetAmount.toLocaleString('en-IN')}
Timeline: ${timeline} years
Target Year: ${targetYear}
Current Saved Amount: ₹${goal.currentAmount.toLocaleString('en-IN')}
Current Monthly Savings: ₹${dynamicFinancials.currentMonthlySavings.toLocaleString('en-IN')}/mo
Current Progress: ${progress}%

Current Investment Allocation:
Equity: ${dynamicAlloc.equity}%
Debt: ${dynamicAlloc.debt}%
Liquid: ${dynamicAlloc.liquid}%
Blended Expected Annual Return: ${dynamicAlloc.expectedAnnualReturn}% p.a.

Calculated Required Monthly Savings: ₹${dynamicFinancials.requiredMonthlySavings.toLocaleString('en-IN')}/mo
Recommended Monthly Savings Increase: ₹${dynamicBoost.toLocaleString('en-IN')}`;
  }

  /**
   * Generates intelligent, structured goal recommendation markdown matching Pipeline 22027 schema
   * ensuring that changing Equity, Debt, Liquid, or Current Monthly Savings produces unique, mathematically sound reports.
   */
  generateIntelligentGoalReport(
    goal: GoalItem,
    alloc: { equity: number; debt: number; liquid: number },
    currentMonthlySavings?: number,
    boostAmount?: number
  ): string {
    const dynamicAlloc = this.calculateSmartAllocation(goal, alloc);
    const fin = this.calculateGoalFinancials(goal, dynamicAlloc, currentMonthlySavings);
    const boost = boostAmount !== undefined && boostAmount > 0 ? boostAmount : fin.recommendedMonthlyBoost;
    const boostSign = boost > 0 ? `+₹${boost.toLocaleString('en-IN')}` : '₹0 (On Track)';
    const targetYear = goal.targetYear || (new Date().getFullYear() + fin.timelineYears);

    const isAhead = fin.isAheadOfTarget;
    const status = isAhead ? 'Ahead of Schedule' : (boost <= 3000 ? 'On Track' : 'Needs Acceleration');

    // Risk and allocation rationale
    let riskLabel = dynamicAlloc.riskProfile;
    let equityRationale = '';
    if (dynamicAlloc.equity >= 70) {
      equityRationale = `With an aggressive ${dynamicAlloc.equity}% Equity allocation yielding ~12% p.a., wealth compounding accelerates significantly. The higher expected portfolio return of ${dynamicAlloc.expectedAnnualReturn}% p.a. lowers your required monthly contribution to ₹${fin.requiredMonthlySavings.toLocaleString('en-IN')}/mo.`;
    } else if (dynamicAlloc.equity >= 45) {
      equityRationale = `A balanced ${dynamicAlloc.equity}% Equity / ${dynamicAlloc.debt}% Debt / ${dynamicAlloc.liquid}% Liquid split balances market appreciation (~12% p.a.) with debt stability (~7% p.a.), generating a solid blended return of ${dynamicAlloc.expectedAnnualReturn}% p.a.`;
    } else if (dynamicAlloc.equity >= 25) {
      equityRationale = `With ${dynamicAlloc.equity}% Equity and ${dynamicAlloc.debt}% Debt, your portfolio emphasizes capital stability (~${dynamicAlloc.expectedAnnualReturn}% p.a. return). Because equity participation is moderate, a higher monthly contribution of ₹${fin.requiredMonthlySavings.toLocaleString('en-IN')}/mo is required to stay on trajectory.`;
    } else {
      equityRationale = `A conservative capital preservation mix (${dynamicAlloc.equity}% Equity, ${dynamicAlloc.debt}% Debt, ${dynamicAlloc.liquid}% Liquid) minimizes market drawdown with a ${dynamicAlloc.expectedAnnualReturn}% p.a. return. To offset lower compounding, higher monthly discipline (₹${fin.requiredMonthlySavings.toLocaleString('en-IN')}/mo) is needed.`;
    }

    const monthlyActionDesc = isAhead
      ? `You are currently saving ₹${fin.currentMonthlySavings.toLocaleString('en-IN')}/mo, which exceeds the required ₹${fin.requiredMonthlySavings.toLocaleString('en-IN')}/mo with ${dynamicAlloc.equity}% Equity. Continue this trajectory to reach your ₹${goal.targetAmount.toLocaleString('en-IN')} target early!`
      : `Increase your monthly savings by ${boostSign}/mo (from ₹${fin.currentMonthlySavings.toLocaleString('en-IN')}/mo to ₹${fin.requiredMonthlySavings.toLocaleString('en-IN')}/mo) across ${dynamicAlloc.equity}% Equity, ${dynamicAlloc.debt}% Debt, and ${dynamicAlloc.liquid}% Liquid to secure your ₹${goal.targetAmount.toLocaleString('en-IN')} milestone by ${targetYear}.`;

    const monthlyAllocEquity = Math.round(fin.requiredMonthlySavings * (dynamicAlloc.equity / 100));
    const monthlyAllocDebt = Math.round(fin.requiredMonthlySavings * (dynamicAlloc.debt / 100));
    const monthlyAllocLiquid = Math.max(0, fin.requiredMonthlySavings - monthlyAllocEquity - monthlyAllocDebt);

    return `GOAL RECOMMENDATION
Goal Name: ${goal.title}
Goal Status: ${status}
Target Amount: ₹${goal.targetAmount.toLocaleString('en-IN')}
Current Saved: ₹${goal.currentAmount.toLocaleString('en-IN')}
Remaining Amount: ₹${fin.remainingAmount.toLocaleString('en-IN')}
Timeline: ${fin.timelineYears} years (${targetYear})
Recommended Monthly Increase: ${boostSign}
Action: ${monthlyActionDesc}

INVESTMENT ALLOCATION & RISK
Equity: ${dynamicAlloc.equity}%
Debt: ${dynamicAlloc.debt}%
Liquid: ${dynamicAlloc.liquid}%
Allocation Risk: ${riskLabel}

ALLOCATION ASSESSMENT
${equityRationale} At this ${dynamicAlloc.expectedAnnualReturn}% blended return rate, your existing ₹${goal.currentAmount.toLocaleString('en-IN')} corpus is projected to grow to approx. ₹${Math.round(goal.currentAmount * Math.pow(1 + (dynamicAlloc.expectedAnnualReturn / 1200), fin.monthsRemaining)).toLocaleString('en-IN')} over ${fin.timelineYears} years. If you maintain your current savings rate of ₹${fin.currentMonthlySavings.toLocaleString('en-IN')}/mo, your total maturity value would reach ₹${fin.projectedMaturityAmount.toLocaleString('en-IN')}${isAhead ? ', exceeding your target.' : `, leaving a gap of ₹${Math.max(0, goal.targetAmount - fin.projectedMaturityAmount).toLocaleString('en-IN')}.`}.

AI ADVISOR VIEW
> **Strategic Portfolio Assessment:**
> - **Current Monthly Saving:** ₹${fin.currentMonthlySavings.toLocaleString('en-IN')}/month
> - **Required Monthly Savings:** ₹${fin.requiredMonthlySavings.toLocaleString('en-IN')}/month (at ${dynamicAlloc.expectedAnnualReturn}% expected return)
> - **Monthly Acceleration Gap:** ${boost > 0 ? `+₹${boost.toLocaleString('en-IN')}/mo needed` : 'Zero shortfall — on track!'}
> - **Asset Allocation Impact:** Shifting Equity allocation to ${dynamicAlloc.equity}% delivers a blended ${dynamicAlloc.expectedAnnualReturn}% annual compounding rate. Higher equity allocation lowers required monthly contributions, whereas conservative allocations require higher monthly contributions to achieve the same target.

FINAL RECOMMENDATION
${isAhead 
  ? `Maintain your current monthly discipline of **₹${fin.currentMonthlySavings.toLocaleString('en-IN')}/mo**. Direct ₹${monthlyAllocEquity.toLocaleString('en-IN')} into Equity Index Funds, ₹${monthlyAllocDebt.toLocaleString('en-IN')} into Debt Securities, and ₹${monthlyAllocLiquid.toLocaleString('en-IN')} into Liquid Funds.`
  : `Set up an automated monthly savings increase of **${boostSign}/mo** to reach total **₹${fin.requiredMonthlySavings.toLocaleString('en-IN')}/mo**. Systematically channel ₹${monthlyAllocEquity.toLocaleString('en-IN')}/mo into broad-market Equity Index/ETFs, ₹${monthlyAllocDebt.toLocaleString('en-IN')}/mo into Corporate Debt, and ₹${monthlyAllocLiquid.toLocaleString('en-IN')}/mo into Liquid Yield funds.`
} Rebalance annually as you approach ${targetYear}.`;
  }

  /**
   * Executes Aava Workflow Pipeline 22027 with input key '{{goal_information_string_true}}'
   * Falls back to intelligent financial engine report if backend pipeline errors or outputs static data
   */
  runGoalRecommendationWorkflow(
    goal: GoalItem,
    boostAmount?: number,
    strategy: string = 'balanced',
    alloc?: { equity: number; debt: number; liquid: number },
    currentMonthlySavings?: number
  ): Observable<{ replyText: string; rawResponse: any }> {
    const resolvedAlloc = alloc || this.calculateSmartAllocation(goal);
    const dynamicFinancials = this.calculateGoalFinancials(goal, resolvedAlloc, currentMonthlySavings);
    const resolvedBoost = boostAmount !== undefined && boostAmount > 0 
      ? boostAmount 
      : dynamicFinancials.recommendedMonthlyBoost;

    const formattedPayload = this.buildGoalInformationString(
      goal, 
      resolvedBoost, 
      resolvedAlloc, 
      currentMonthlySavings ?? dynamicFinancials.currentMonthlySavings
    );

    return this.workflowService
      .runWorkflowAndAwaitResult(formattedPayload, '{{goal_information_string_true}}', {
        pipelineId: '22027'
      })
      .pipe(
        map(response => {
          let replyText = this.workflowService.extractReplyText(response);
          // If response does not contain the required structured sections
          if (!replyText || !replyText.includes('GOAL RECOMMENDATION') || !replyText.includes('INVESTMENT ALLOCATION')) {
            replyText = this.generateIntelligentGoalReport(
              goal, 
              resolvedAlloc, 
              currentMonthlySavings ?? dynamicFinancials.currentMonthlySavings,
              resolvedBoost
            );
          }
          return {
            replyText,
            rawResponse: response
          };
        }),
        catchError(err => {
          console.warn('[GoalsService] Aava pipeline workflow encountered issue, utilizing intelligent financial engine fallback:', err);
          const intelligentReport = this.generateIntelligentGoalReport(
            goal, 
            resolvedAlloc, 
            currentMonthlySavings ?? dynamicFinancials.currentMonthlySavings,
            resolvedBoost
          );
          return of({
            replyText: intelligentReport,
            rawResponse: { fallback: true, error: err?.message }
          });
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
   * Update custom allocation and/or monthly boost settings for a goal
   */
  async updateGoalCustomSettings(
    goalId: string,
    settings: {
      equityAllocation?: number;
      debtAllocation?: number;
      liquidAllocation?: number;
      monthlyBoost?: number;
      monthlySavings?: number;
    }
  ): Promise<void> {
    let targetGoal: GoalItem | null = null;
    const updatedList = this.goals().map(g => {
      if (g.id === goalId || (!goalId && g.isPrimary)) {
        const updated: GoalItem = {
          ...g,
          equityAllocation: settings.equityAllocation !== undefined ? settings.equityAllocation : g.equityAllocation,
          debtAllocation: settings.debtAllocation !== undefined ? settings.debtAllocation : g.debtAllocation,
          liquidAllocation: settings.liquidAllocation !== undefined ? settings.liquidAllocation : g.liquidAllocation,
          monthlyBoost: settings.monthlyBoost !== undefined ? settings.monthlyBoost : g.monthlyBoost,
          monthlySavings: settings.monthlySavings !== undefined ? settings.monthlySavings : g.monthlySavings
        };
        targetGoal = updated;
        return updated;
      }
      return g;
    });

    this.goals.set(updatedList);
    this.saveToLocalCache(updatedList);

    const uid = this.authService.currentUserId();
    if (uid && this.authService.isLoggedIn() && targetGoal) {
      try {
        await this.firestoreService.saveGoal(uid, targetGoal);
      } catch (error) {
        console.error('Error updating goal settings in Firestore:', error);
      }
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
    alloc?: { equity: number; debt: number; liquid: number },
    monthlySavings?: number
  ): Promise<void> {
    let targetGoal: GoalItem | null = null;

    const updatedList = this.goals().map(g => {
      if (g.id === goalId || (!goalId && g.isPrimary)) {
        const updated: GoalItem = {
          ...g,
          status: 'Optimized',
          currentAmount: g.currentAmount + boostAmount,
          monthlyBoost: boostAmount,
          monthlySavings: monthlySavings !== undefined ? monthlySavings : g.monthlySavings,
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
