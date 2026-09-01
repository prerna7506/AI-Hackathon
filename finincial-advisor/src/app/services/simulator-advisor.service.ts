import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError, switchMap, of } from 'rxjs';

export interface PreparednessReportData {
  situation: string;
  score: number;
  status: 'Well Prepared' | 'Mostly Prepared' | 'Needs Improvement' | 'Not Prepared';
  statusDescription: string;
  requiredAmount: number;
  insuranceConsidered: number;
  amountStillToCover: number;
  accessibleSavings: number;
  savingsPlusFd: number;
  totalAssets: number;
  savingsBank: number;
  liquidFund: number;
  fd: number;
  gold: number;
  market: number;
  backupMonths: number;
  shortfall: number;
  advisorVerdict: string;
  recommendation: string;
  fundsBreakdown: { label: string; amount: number; percent: number; color: string; offset: number }[];
  scenarioComparison: { label: string; amount: number; percent: number; color: string; badge?: string }[];
}

/**
 * Response shape for POST /workflows/workflow-executions
 */
export interface WorkflowSubmitResponse {
  data: {
    message: string;
    workflowExecutionId: string;
    jobId: number;
  };
  status: string;
}

/**
 * Response shape for GET /workflows/workflow-executions/{id}/result
 */
export interface WorkflowResultResponse {
  status?: string;
  error?: string;
  data?: {
    status?: string;
    result?: any;
    [key: string]: any;
  };
  result?: any;
  [key: string]: any;
}

@Injectable({
  providedIn: 'root'
})
export class SimulatorWorkflowService {
  private readonly baseUrl = 'https://int-ai.aava.ai/workflows/workflow-executions';

  // Configuration with Pipeline ID 21759 for What-If Simulator (Financial Preparedness Advisor)
  private readonly defaultPipelineId = '21759';
  private readonly defaultUser = 'ayan.gorain@ascendion.com';
  private readonly defaultPriority = '1';

  private readonly authToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJBeWFuIEdvcmFpbiIsImlhdCI6MTc4NzkyMTI0MiwiZXhwIjoxNzk3MTE5OTk5LCJhcHBpZCI6IjBlM2JiZDBiLTM3YzQtNDc1Zi1hMTk1LWM3OTVlNWEyYTljMiIsInVuaXF1ZV9uYW1lIjoiYXlhbi5nb3JhaW5AYXNjZW5kaW9uLmNvbSIsImRvbWFpbiI6ImludC1haS5hYXZhLmFpIiwidXNlckRldGFpbHMiOiJ5Sm1JN1IvSW9rNXcxT3ZuTVVZSjB0aXRBRUFHRU8zV3Z2SzZFMnI1aVZ4MitZNmQ3TXNIaUpKeW1XaFg1eFhJZGhuV0hPMVNYaGR3Vy9YSHNhUEc5Z1V0d2ozK2JrZ3lVcU1UOW9Mb2Q4eEJSQWVLR01PZlljS0hIZ2Y4M2dtcy9JOENsYjhBUEpmZ2w1aW80dGtQUkg1VnBTTXY5UzJ4ODg4czRPRTdzYm89In0.ICdAe2suUZde0Xx1OltJUV2FTyPf1DVdFVmx9ZxyJFLPdmMXRtGaWyudbstT3Yy574Gkio8_sbhCvLUQB9KMmg6EVBEhyaDpGYtIgeMq7F2AsEdWQWURT5a9u3eTb9S42hvQEfoLmk_OaGgdO3HTVDeGIut_G09-88iKm_hRSnbNh0kyXHXOx6iq5G0TsXukPiQ7jJil2Z86XlQRMZeYUT50fF-bnTFenrpzC1hjbCP2zvh4n8aNt0_Hnqp6n4rw8L_plLq1D3ZnlQ9vKd-NFMTnFI4TS_wyDuDGrNFB-thbWTe5og5VJTeN47xDOT1NMEI1FpX16zcOZ-HSGi0tUw';

  private readonly pollIntervalMs = 3000;
  private readonly maxPollAttempts = 40;

  constructor(private http: HttpClient) {}

  private buildHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Accept': 'application/json, text/plain, */*',
      'Authorization': `Bearer ${this.authToken}`
    });
  }

  /**
   * Step 1: Submit the workflow with user input to Pipeline 21759
   */
  submitWorkflow(
    userInputText: string,
    inputKey: string = '{{input_string_true}}',
    options?: { pipelineId?: string; user?: string; priority?: string }
  ): Observable<WorkflowSubmitResponse> {
    const formData = new FormData();

    const formattedValue = userInputText
      ? userInputText.charAt(0).toUpperCase() + userInputText.slice(1)
      : userInputText;

    formData.append('pipelineId', options?.pipelineId ?? this.defaultPipelineId);
    formData.append('user', options?.user ?? this.defaultUser);
    formData.append('userInputs', JSON.stringify({ [inputKey]: formattedValue }));
    formData.append('priority', options?.priority ?? this.defaultPriority);

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.authToken}`
    });

    return this.http
      .post<WorkflowSubmitResponse>(this.baseUrl, formData, { headers })
      .pipe(
        switchMap(response => {
          console.log('[SimulatorWorkflow] Submitted to Pipeline 21759. Execution ID:', response.data.workflowExecutionId);
          return of(response);
        })
      );
  }

  /**
   * Step 2: Poll GET until workflow status reaches COMPLETED or SUCCESS
   */
  pollForResult(executionId: string): Observable<WorkflowResultResponse> {
    return new Observable<WorkflowResultResponse>((subscriber) => {
      let pollAttempts = 0;
      let timeoutId: any = null;
      let isCancelled = false;

      const poll = () => {
        if (isCancelled) return;

        pollAttempts++;
        this.getWorkflowResult(executionId).subscribe({
          next: (response) => {
            if (isCancelled) return;

            const innerStatus = (
              response?.data?.status ??
              response?.['workflowStatus'] ??
              response?.data?.['workflowStatus'] ??
              response?.status ??
              ''
            ).toString().toUpperCase().trim();

            const isIntermediate = [
              'QUEUED',
              'IN_PROGRESS',
              'RUNNING',
              'PENDING',
              'STARTED',
              'INITIALIZING',
              'PROCESSING'
            ].includes(innerStatus);

            const hasResult = Boolean(
              response?.data?.result?.response ||
              response?.data?.result ||
              response?.result
            );

            if (isIntermediate && !hasResult) {
              timeoutId = setTimeout(poll, this.pollIntervalMs);
              return;
            }

            if (['SUCCESS', 'COMPLETED', 'FINISHED', 'DONE'].includes(innerStatus) || hasResult) {
              subscriber.next(response);
              subscriber.complete();
              return;
            }

            if (['FAILED', 'ERROR', 'CANCELLED'].includes(innerStatus)) {
              const errMsg = response.error || response.data?.['message'] || `Workflow failed with status: ${innerStatus}`;
              subscriber.error(new Error(errMsg));
              return;
            }

            if (pollAttempts >= this.maxPollAttempts) {
              subscriber.error(new Error('Timed out waiting for workflow result.'));
              return;
            }

            timeoutId = setTimeout(poll, this.pollIntervalMs);
          },
          error: (err) => {
            if (isCancelled) return;
            if (pollAttempts < this.maxPollAttempts) {
              timeoutId = setTimeout(poll, this.pollIntervalMs);
            } else {
              subscriber.error(err);
            }
          }
        });
      };

      poll();

      return () => {
        isCancelled = true;
        if (timeoutId) clearTimeout(timeoutId);
      };
    });
  }

  /**
   * Step 3: Fetch workflow execution result
   */
  private getWorkflowResult(executionId: string): Observable<WorkflowResultResponse> {
    const url = `${this.baseUrl}/${executionId}/result`;

    return this.http
      .get<WorkflowResultResponse>(url, { headers: this.buildHeaders() })
      .pipe(
        switchMap(response => {
          if (response && 'error' in response) {
            return throwError(() => new Error(response['error']));
          }
          return of(response);
        })
      );
  }

  /**
   * Full workflow runner: Submit → Poll → Return Result
   */
  runWorkflowAndAwaitResult(
    userInputText: string,
    inputKey: string = '{{input_string_true}}',
    options?: { pipelineId?: string; user?: string; priority?: string }
  ): Observable<WorkflowResultResponse> {
    return this.submitWorkflow(userInputText, inputKey, options).pipe(
      switchMap((submitResponse) => {
        const executionId = submitResponse?.data?.workflowExecutionId;
        if (!executionId) {
          return throwError(() => new Error('No workflowExecutionId returned from submit'));
        }
        return this.pollForResult(executionId);
      })
    );
  }

  /**
   * Deep recursive extractor to locate human-readable response
   */
  extractReplyText(response: any, fallbackParams?: any): string {
    if (!response) {
      return this.generateCalculationReport(fallbackParams);
    }

    const foundText = this.findFormattedOutput(response);
    if (foundText && foundText.length > 20) {
      return foundText;
    }

    return this.generateCalculationReport(fallbackParams);
  }

  private findFormattedOutput(node: any, depth = 0): string | null {
    if (!node || depth > 10) return null;

    if (typeof node === 'string') {
      const trimmed = node.trim();

      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
          const parsed = JSON.parse(trimmed);
          const res = this.findFormattedOutput(parsed, depth + 1);
          if (res) return res;
        } catch {}
      }

      if (
        trimmed.includes('FINANCIAL PREPAREDNESS CHECK') ||
        trimmed.includes('Your preparedness score') ||
        trimmed.includes('WHAT YOU MAY NEED') ||
        trimmed.includes('AFFORDABILITY SCORE')
      ) {
        return trimmed;
      }
      return null;
    }

    if (typeof node === 'object') {
      const candidates = ['output', 'raw', 'result', 'final_output', 'answer', 'text', 'message', 'content'];
      for (const key of candidates) {
        const val = node[key];
        if (typeof val === 'string' && val.length > 30) {
          if (!val.startsWith('You are AAVA') && !val.startsWith('{"pipeLineId"') && !val.includes('"workflowId": 21759')) {
            const nested = this.findFormattedOutput(val, depth + 1);
            if (nested) return nested;
            if (val.includes('FINANCIAL PREPAREDNESS') || val.includes('Score') || val.includes('₹') || val.includes('Situation:')) {
              return val;
            }
          }
        }
      }

      if (Array.isArray(node.tasksOutputs)) {
        for (let i = node.tasksOutputs.length - 1; i >= 0; i--) {
          const res = this.findFormattedOutput(node.tasksOutputs[i], depth + 1);
          if (res) return res;
        }
      }

      if (Array.isArray(node.pipeLineAgents)) {
        for (let i = node.pipeLineAgents.length - 1; i >= 0; i--) {
          const res = this.findFormattedOutput(node.pipeLineAgents[i], depth + 1);
          if (res) return res;
        }
      }

      if (Array.isArray(node.agents)) {
        for (let i = node.agents.length - 1; i >= 0; i--) {
          const res = this.findFormattedOutput(node.agents[i], depth + 1);
          if (res) return res;
        }
      }

      if (node.data) {
        const res = this.findFormattedOutput(node.data, depth + 1);
        if (res) return res;
      }

      if (node.result) {
        const res = this.findFormattedOutput(node.result, depth + 1);
        if (res) return res;
      }
    }

    return null;
  }

  /**
   * Builds structured PreparednessReportData for interactive charts & cards
   */
  buildStructuredReport(params: any, rawMarkdown?: string): PreparednessReportData {
    const monthlyExpenses = params?.monthlyExpenses || 0;
    const jobLossMonths = params?.jobLossMonths || 6;
    const medicalBill = params?.medicalBill || 0;
    const insurance = params?.insurance || 0;
    const bigExpense = params?.bigExpense || 0;
    const savingsBank = params?.savingsBankBalance || 0;
    const liquidFund = params?.liquidFund || 0;
    const fd = params?.fdInvestment || 0;
    const gold = params?.goldInvestment || 0;
    const market = params?.marketInvestment || 0;
    const scenario = params?.scenarioId || 'job_loss';

    const accessibleSavings = savingsBank + liquidFund;
    const savingsPlusFd = accessibleSavings + fd;
    const totalAssets = accessibleSavings + fd + gold + market;

    let requiredAmount = 0;
    let insuranceUsed = 0;
    let situation = 'Job Loss';

    if (scenario === 'job_loss') {
      const months = jobLossMonths > 0 ? jobLossMonths : 6;
      requiredAmount = monthlyExpenses * months;
      insuranceUsed = 0;
      situation = 'Job Loss';
    } else if (scenario === 'medical_bill' || scenario === 'medical_emergency') {
      requiredAmount = medicalBill;
      insuranceUsed = Math.min(insurance, requiredAmount);
      situation = 'Medical Bill';
    } else {
      requiredAmount = bigExpense;
      insuranceUsed = 0;
      situation = 'Big Unexpected Expense';
    }

    const amountStillToCover = Math.max(requiredAmount - insuranceUsed, 0);
    const shortfall = Math.max(amountStillToCover - accessibleSavings, 0);
    const backupMonths = monthlyExpenses > 0 ? parseFloat((accessibleSavings / monthlyExpenses).toFixed(1)) : 0;

    let accessiblePercent = amountStillToCover > 0
      ? Math.min(100, Math.max(0, (accessibleSavings / amountStillToCover) * 100))
      : 100;

    let score = accessiblePercent;
    if (backupMonths >= 6) score += 10;
    else if (backupMonths >= 3) score += 5;

    if (backupMonths < 1) score -= 15;
    else if (backupMonths < 3) score -= 5;

    score = Math.max(0, Math.min(100, Math.round(score)));

    let status: 'Well Prepared' | 'Mostly Prepared' | 'Needs Improvement' | 'Not Prepared' = 'Mostly Prepared';
    let recommendation = 'Build more easily accessible savings to strengthen your financial backup.';

    if (score >= 80) {
      status = 'Well Prepared';
      recommendation = 'You look well prepared for this situation. Keep building your liquid savings to maintain a rock-solid buffer.';
    } else if (score >= 60) {
      status = 'Mostly Prepared';
      recommendation = 'You are fairly prepared, but building more easily accessible savings will give you greater peace of mind.';
    } else if (score >= 40) {
      status = 'Needs Improvement';
      recommendation = 'It would be better to build more accessible liquid savings before this emergency happens.';
    } else {
      status = 'Not Prepared';
      recommendation = 'Your accessible savings may not be enough for this situation. Prioritize building an emergency buffer.';
    }

    const statusDescription = `${status}: You have ₹${accessibleSavings.toLocaleString('en-IN')} in easily accessible funds against an estimated ₹${amountStillToCover.toLocaleString('en-IN')} requirement.`;
    const advisorVerdict = `${status}: Your financial resources provide a solid baseline. Maintaining a dedicated emergency pool ensures you avoid premature liquidation of market assets.`;

    // Asset Breakdown Chart Data
    const rawBreakdown = [
      { label: 'Bank Savings', amount: savingsBank, color: '#3B82F6' },
      { label: 'Liquid Fund', amount: liquidFund, color: '#10B981' },
      { label: 'Fixed Deposits', amount: fd, color: '#F59E0B' },
      { label: 'Gold Investment', amount: gold, color: '#EAB308' },
      { label: 'Market Investment', amount: market, color: '#8B5CF6' }
    ];

    const validAssetsTotal = totalAssets > 0 ? totalAssets : 1;
    let accumulatedOffset = 0;
    const circumference = 376.99; // 2 * PI * 60

    const fundsBreakdown = rawBreakdown.map(item => {
      const percent = totalAssets > 0 ? (item.amount / validAssetsTotal) * 100 : 0;
      const strokeLength = (percent / 100) * circumference;
      const offset = circumference - accumulatedOffset;
      accumulatedOffset += strokeLength;

      return {
        label: item.label,
        amount: item.amount,
        percent: parseFloat(percent.toFixed(1)),
        color: item.color,
        offset: offset
      };
    });

    // Scenario Comparison Bar Chart Data
    const maxComp = Math.max(amountStillToCover, accessibleSavings, savingsPlusFd, totalAssets, 1);

    const scenarioComparison = [
      {
        label: 'Required Amount',
        amount: amountStillToCover,
        percent: Math.min(100, (amountStillToCover / maxComp) * 100),
        color: '#EF4444',
        badge: 'Estimated Need'
      },
      {
        label: 'Accessible Savings',
        amount: accessibleSavings,
        percent: Math.min(100, (accessibleSavings / maxComp) * 100),
        color: '#3B82F6',
        badge: 'Instant Cash'
      },
      {
        label: 'Savings + FD',
        amount: savingsPlusFd,
        percent: Math.min(100, (savingsPlusFd / maxComp) * 100),
        color: '#10B981',
        badge: 'Safe Reserves'
      },
      {
        label: 'Total Net Worth',
        amount: totalAssets,
        percent: Math.min(100, (totalAssets / maxComp) * 100),
        color: '#8B5CF6',
        badge: 'Full Portfolio'
      }
    ];

    return {
      situation,
      score,
      status,
      statusDescription,
      requiredAmount,
      insuranceConsidered: insuranceUsed,
      amountStillToCover,
      accessibleSavings,
      savingsPlusFd,
      totalAssets,
      savingsBank,
      liquidFund,
      fd,
      gold,
      market,
      backupMonths,
      shortfall,
      advisorVerdict,
      recommendation,
      fundsBreakdown,
      scenarioComparison
    };
  }

  /**
   * Generates a fully formatted Financial Preparedness Report Markdown text
   */
  generateCalculationReport(params?: any): string {
    const r = this.buildStructuredReport(params);

    return `FINANCIAL PREPAREDNESS CHECK

Situation:
${r.situation}

Your preparedness score:
${r.score} out of 100

This means:
${r.statusDescription}

WHAT YOU MAY NEED

Required amount:
₹${r.requiredAmount.toLocaleString('en-IN')}

Insurance considered:
₹${r.insuranceConsidered.toLocaleString('en-IN')}

Amount still to cover:
₹${r.amountStillToCover.toLocaleString('en-IN')}

YOUR AVAILABLE MONEY

Bank savings:
₹${r.savingsBank.toLocaleString('en-IN')}

Liquid fund:
₹${r.liquidFund.toLocaleString('en-IN')}

FD:
₹${r.fd.toLocaleString('en-IN')}

Gold:
₹${r.gold.toLocaleString('en-IN')}

Market investments:
₹${r.market.toLocaleString('en-IN')}

EASY-TO-ACCESS MONEY

About ₹${r.accessibleSavings.toLocaleString('en-IN')} is currently available through your bank savings and liquid mutual funds.

YOUR SAFETY BACKUP

Your easily available savings provide about ${r.backupMonths} months of normal living expense backup.

SHORTFALL

${r.shortfall > 0
  ? `You may need about ₹${r.shortfall.toLocaleString('en-IN')} more to fully cover this requirement using only easily accessible savings.`
  : `Your accessible savings could cover the entire estimated scenario need without touching other investments.`}

FINANCIAL ADVISOR VIEW

${r.advisorVerdict}

RECOMMENDATION

${r.recommendation}`;
  }
}
