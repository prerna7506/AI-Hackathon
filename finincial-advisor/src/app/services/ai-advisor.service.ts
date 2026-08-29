import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, throwError, timer, switchMap, filter, take, map, of, expand, EMPTY } from 'rxjs';

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
 * Can be minimal (status only) or full (with data/result)
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
export class WorkflowService {
  private readonly baseUrl = 'https://int-ai.aava.ai/workflows/workflow-executions';

  // Configuration
  private readonly defaultPipelineId = '21426';
  private readonly defaultUser = 'ayan.gorain@ascendion.com';
  private readonly defaultPriority = '1';
  private readonly defaultRealmId = '1';

  // TODO: Move this to environment.ts (or a secure config) instead of hardcoding it here.
  private readonly authToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJBeWFuIEdvcmFpbiIsImlhdCI6MTc4NzkyMTI0MiwiZXhwIjoxNzk3MTE5OTk5LCJhcHBpZCI6IjBlM2JiZDBiLTM3YzQtNDc1Zi1hMTk1LWM3OTVlNWEyYTljMiIsInVuaXF1ZV9uYW1lIjoiYXlhbi5nb3JhaW5AYXNjZW5kaW9uLmNvbSIsImRvbWFpbiI6ImludC1haS5hYXZhLmFpIiwidXNlckRldGFpbHMiOiJ5Sm1JN1IvSW9rNXcxT3ZuTVVZSjB0aXRBRUFHRU8zV3Z2SzZFMnI1aVZ4MitZNmQ3TXNIaUpKeW1XaFg1eFhJZGhuV0hPMVNYaGR3Vy9YSHNhUEc5Z1V0d2ozK2JrZ3lVcU1UOW9Mb2Q4eEJSQWVLR01PZlljS0hIZ2Y4M2dtcy9JOENsYjhBUEpmZ2w1aW80dGtQUkg1VnBTTXY5UzJ4ODg4czRPRTdzYm89In0.ICdAe2suUZde0Xx1OltJUV2FTyPf1DVdFVmx9ZxyJFLPdmMXRtGaWyudbstT3Yy574Gkio8_sbhCvLUQB9KMmg6EVBEhyaDpGYtIgeMq7F2AsEdWQWURT5a9u3eTb9S42hvQEfoLmk_OaGgdO3HTVDeGIut_G09-88iKm_hRSnbNh0kyXHXOx6iq5G0TsXukPiQ7jJil2Z86XlQRMZeYUT50fF-bnTFenrpzC1hjbCP2zvh4n8aNt0_Hnqp6n4rw8L_plLq1D3ZnlQ9vKd-NFMTnFI4TS_wyDuDGrNFB-thbWTe5og5VJTeN47xDOT1NMEI1FpX16zcOZ-HSGi0tUw';

  // Polling configuration
  private readonly pollIntervalMs = 3000;        // Poll every 3 seconds
  private readonly maxPollAttempts = 40;          // Max 120 seconds (40 * 3s)

  constructor(private http: HttpClient) { }

  private buildHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Accept': 'application/json, text/plain, */*',
      'Authorization': `Bearer ${this.authToken}`,
     
    });
  }

  /**
   * Step 1: Submit the workflow with user input
   * Returns workflowExecutionId to track the job
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
          console.log('✅ Workflow submitted:', response.data.workflowExecutionId);
          return of(response);
        })
      );
  }

  /**
   * Step 2: Poll GET until workflow status reaches COMPLETED
   * 
   * ✅ CRITICAL: This method ONLY emits when status is COMPLETED/SUCCESS/FINISHED/DONE
   * All other statuses (QUEUED, RUNNING, etc) silently keep polling
   * 
   * Sequence:
   * GET → {"status": "QUEUED"} → Keep polling (NO subscriber.next() called)
   * GET → {"status": "RUNNING"} → Keep polling (NO subscriber.next() called)
   * GET → {"status": "COMPLETED", "data": {...}} → subscriber.next(response) + complete ✅
   */
  pollForResult(executionId: string): Observable<WorkflowResultResponse> {
    console.log(`⏳ Starting to poll for execution: ${executionId}`);

    return new Observable<WorkflowResultResponse>((subscriber) => {
      let pollAttempts = 0;
      let timeoutId: any = null;
      let isCancelled = false;

      const poll = () => {
        if (isCancelled) return;

        pollAttempts++;
        console.log(`📡 [Poll #${pollAttempts}/${this.maxPollAttempts}] Fetching result for ${executionId}...`);

        this.getWorkflowResult(executionId).subscribe({
          next: (response) => {
            if (isCancelled) return;

            // ✅ CRITICAL: The execution status is inside response.data.status!
            // response.status is just the HTTP envelope ("SUCCESS").
            const innerStatus = (
              response?.data?.status ??
              response?.['workflowStatus'] ??
              response?.data?.['workflowStatus'] ??
              ''
            ).toString().toUpperCase().trim();

            console.log(`📊 [Poll #${pollAttempts}] data.status: "${innerStatus}", wrapper: "${response?.status}"`);

            const isIntermediate = [
              'QUEUED',
              'IN_PROGRESS',
              'RUNNING',
              'PENDING',
              'STARTED',
              'INITIALIZING',
              'PROCESSING'
            ].includes(innerStatus);

            const hasResult = Boolean(response?.data?.result || response?.result);

            // 1. If still in progress and no final result -> keep polling silently (no UI emission)
            if (isIntermediate && !hasResult) {
              console.log(`⏳ [SILENT POLL] Status is "${innerStatus}" - continuing to poll...`);
              timeoutId = setTimeout(poll, this.pollIntervalMs);
              return;
            }

            // 2. Success completion -> emit to UI and complete
            if (['SUCCESS', 'COMPLETED', 'FINISHED', 'DONE'].includes(innerStatus) || hasResult) {
              console.log('✅✅✅ [EMIT] Workflow COMPLETED! Emitting result to UI:', response);
              subscriber.next(response);
              subscriber.complete();
              return;
            }

            // 3. Failure terminal state -> error out
            if (['FAILED', 'ERROR', 'CANCELLED'].includes(innerStatus)) {
              const errMsg = response.error || response.data?.['message'] || `Workflow failed with status: ${innerStatus}`;
              console.error('❌ Workflow failed:', errMsg);
              subscriber.error(new Error(errMsg));
              return;
            }

            // 4. Timeout reached
            if (pollAttempts >= this.maxPollAttempts) {
              console.error('❌ Max poll attempts reached without completion.');
              subscriber.error(new Error('Timed out waiting for workflow result.'));
              return;
            }

            // 5. Default: keep polling
            console.log(`⏳ Unknown status "${innerStatus}" - treating as in-progress...`);
            timeoutId = setTimeout(poll, this.pollIntervalMs);
          },
          error: (err) => {
            if (isCancelled) return;
            console.warn(`⚠️ [Poll #${pollAttempts}] Request error:`, err);

            if (pollAttempts < this.maxPollAttempts) {
              console.log(`🔄 Retrying poll in ${this.pollIntervalMs}ms...`);
              timeoutId = setTimeout(poll, this.pollIntervalMs);
            } else {
              subscriber.error(err);
            }
          }
        });
      };

      // Start the first poll immediately
      poll();

      // Teardown / cleanup on unsubscribe
      return () => {
        isCancelled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };
    });
  }

  /**
   * Step 3: Single GET call to fetch workflow result
   * Can return:
   * - {"status": "QUEUED"} - Not ready yet
   * - {"status": "RUNNING"} - Still processing
   * - {"status": "COMPLETED", "data": {...}} - Done with results
   */
  private getWorkflowResult(executionId: string): Observable<WorkflowResultResponse> {
    const url = `${this.baseUrl}/${executionId}/result`;

    return this.http
      .get<WorkflowResultResponse>(url, { headers: this.buildHeaders() })
      .pipe(
        switchMap(response => {
          // If we get an error response, throw it
          if (response && 'error' in response) {
            return throwError(() => new Error(response['error']));
          }
          return of(response);
        })
      );
  }

  /**
   * Check if workflow is done processing.
   * Keeps polling until status reaches COMPLETED (or terminal status).
   */
  private isJobDone(response: WorkflowResultResponse): boolean {
    if (!response) {
      return false;
    }

    const status = (
      response.status ??
      response.data?.status ??
      response['workflowStatus'] ??
      response.data?.['workflowStatus'] ??
      ''
    ).toString().toUpperCase().trim();

    // Only done when status is COMPLETED or terminal state
    if (['COMPLETED', 'SUCCESS', 'FINISHED', 'DONE', 'FAILED', 'ERROR', 'CANCELLED'].includes(status)) {
      return true;
    }

    // Otherwise, keep polling
    return false;
  }

  /**
   * Full workflow: Submit → Poll → Get Result
   * 
   * Usage:
   * this.workflowService.runWorkflowAndAwaitResult('Car')
   *   .subscribe(
   *     (result) => console.log('Result:', result),
   *     (error) => console.error('Error:', error)
   *   );
   */
  runWorkflowAndAwaitResult(
    userInputText: string,
    inputKey: string = '{{input_string_true}}',
    options?: { pipelineId?: string; user?: string; priority?: string }
  ): Observable<WorkflowResultResponse> {
    console.log('🚀 Starting workflow for:', userInputText);

    return this.submitWorkflow(userInputText, inputKey, options).pipe(
      // After submit, get the executionId and start polling
      switchMap((submitResponse) => {
        const executionId = submitResponse?.data?.workflowExecutionId;

        if (!executionId) {
          return throwError(() => new Error('No workflowExecutionId returned from submit'));
        }

        // Now start polling for results (it will ONLY emit when COMPLETED)
        return this.pollForResult(executionId);
      })
    );
  }

  private handleError(error: HttpErrorResponse) {
    console.error('🔴 Service error:', error);
    const message = error.error?.message || error.message || 'Workflow API error';
    return throwError(() => new Error(message));
  }
}

export { WorkflowService as AiAdvisorService, WorkflowService as AiAdvisors };