import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';

@Pipe({
  name: 'markdown',
  standalone: true
})
export class MarkdownPipe implements PipeTransform {
  private sanitizer = inject(DomSanitizer);

  constructor() {
    marked.setOptions({
      gfm: true,
      breaks: true
    });
  }

  transform(value: string | null | undefined): SafeHtml {
    if (!value) return '';
    let text = value;

    // 0. Handle Goal Recommendation Reports from Pipeline 22027
    if (text.includes('GOAL RECOMMENDATION') || text.includes('GOAL AI') || text.includes('INVESTMENT ALLOCATION')) {
      const goalHtml = this.parseGoalRecommendation(text);
      if (goalHtml) {
        return this.sanitizer.bypassSecurityTrustHtml(goalHtml);
      }
    }

    // 1. Transform Score Block with Box-Drawing Lines (e.g. ━━━━━━━━━━━━ AFFORDABILITY SCORE: 90 / 100 ...)
    const scoreBoxRegex = /━{3,}\s*[\r\n]+(?:AFFORDABILITY|PREPAREDNESS)\s*SCORE:\s*(\d+)\s*\/\s*100\s*[\r\n]+([^\r\n]+)[\r\n]+\s*━{3,}/gi;
    text = text.replace(scoreBoxRegex, (_match, scoreStr, statusText) => {
      return this.generateScoreCardHtml(parseInt(scoreStr, 10), statusText.trim());
    });

    // Also handle score block without box drawing lines
    const scoreSimpleRegex = /(?:^|[\r\n])(?:AFFORDABILITY|PREPAREDNESS)\s*SCORE:\s*(\d+)\s*\/\s*100\s*[\r\n]+([^\r\n]+)/gi;
    text = text.replace(scoreSimpleRegex, (match, scoreStr, statusText) => {
      if (match.includes('affordability-score-card')) return match;
      return this.generateScoreCardHtml(parseInt(scoreStr, 10), statusText.trim());
    });

    // Handle "Your preparedness score: XX out of 100 \n This means: ..." format from Pipeline 21759
    const prepScoreRegex = /(?:^|[\r\n])Your preparedness score:\s*[\r\n]*(\d+)\s*(?:out of 100|\/ 100)?\s*[\r\n]+(?:This means:\s*[\r\n]*)?([^\r\n]+)/gi;
    text = text.replace(prepScoreRegex, (_match, scoreStr, statusText) => {
      return this.generateScoreCardHtml(parseInt(scoreStr, 10), statusText.trim(), 'FINANCIAL PREPAREDNESS SCORE');
    });

    // 2. Remove remaining box drawing characters
    text = text.replace(/━{3,}/g, '\n---\n');

    // 3. Format Meta Line: "Target: [target] • Cost: ₹[cost]" or "Target: [target]"
    const metaRegex = /(?:^|[\r\n])Target:\s*([^•\n\r]+?)(?:\s*•\s*Cost:\s*([^\n\r]+))?(?=$|[\r\n])/gim;
    text = text.replace(metaRegex, (_match, targetVal, costVal) => {
      const target = (targetVal || '').trim();
      const cost = costVal ? costVal.trim() : null;
      return `\n\n<div class="snapshot-meta-banner"><div class="meta-pill meta-target"><span class="meta-icon">🎯</span><span class="meta-label">Target:</span><strong class="meta-value">${target}</strong></div>${
        cost
          ? `<div class="meta-pill meta-cost"><span class="meta-icon">💰</span><span class="meta-label">Total Cost:</span><strong class="meta-value">${cost}</strong></div>`
          : ''
      }</div>\n\n`;
    });

    // 4. Transform Financial Advisor's Verdict / Recommendation into unified verdict card
    const verdictSectionRegex = /(?:^|[\r\n])(?:#{1,4}\s*)?(?:FINANCIAL ADVISOR\'S VERDICT|FINANCIAL ADVISOR VIEW)\s*[\r\n]+(?:>\s*(?:Recommendation:\s*)?([^\r\n]+)|([^\r\n]+))/gi;
    text = text.replace(verdictSectionRegex, (_match, blockquoteText, plainText) => {
      const verdictContent = (blockquoteText || plainText || '').trim();
      return `\n\n<div class="verdict-card"><div class="verdict-header"><span class="verdict-title">FINANCIAL ADVISOR'S VIEW</span></div><div class="verdict-content"><p>${verdictContent}</p></div></div>\n\n`;
    });

    // Transform FINAL RECOMMENDATION into callout
    const finalRecRegex = /(?:^|[\r\n])(?:#{1,4}\s*)?FINAL RECOMMENDATION\s*[\r\n]+([^\r\n]+)/gi;
    text = text.replace(finalRecRegex, (_match, recText) => {
      return `\n\n<div class="quote-callout quote-final-rec"><strong>🎯 Final Strategic Recommendation:</strong><p>${recText.trim()}</p></div>\n\n`;
    });

    // Transform generic RECOMMENDATION into callout
    const recRegex = /(?:^|[\r\n])(?:#{1,4}\s*)?RECOMMENDATION\s*[\r\n]+([^\r\n]+)/gi;
    text = text.replace(recRegex, (_match, recText) => {
      if (_match.includes('FINAL RECOMMENDATION')) return _match;
      return `\n\n<div class="quote-callout"><strong>💡 Strategic Recommendation:</strong><p>${recText.trim()}</p></div>\n\n`;
    });

    // 5. Transform other Section Headers into clean headings
    text = text.replace(/(?:^|[\r\n])FINANCIAL PREPAREDNESS CHECK(?=$|[\r\n])/gim, '\n## 🛡️ FINANCIAL PREPAREDNESS CHECK\n');
    text = text.replace(/(?:^|[\r\n])YOUR AFFORDABILITY SNAPSHOT(?=$|[\r\n])/gim, '\n### 🏆 YOUR AFFORDABILITY SNAPSHOT\n');
    text = text.replace(/(?:^|[\r\n])YOUR FINANCIAL DETAILS(?=$|[\r\n])/gim, '\n### 📋 YOUR FINANCIAL DETAILS\n');
    text = text.replace(/(?:^|[\r\n])WHAT YOU MAY NEED(?=$|[\r\n])/gim, '\n### 💡 WHAT YOU MAY NEED\n');
    text = text.replace(/(?:^|[\r\n])YOUR AVAILABLE MONEY(?=$|[\r\n])/gim, '\n### 💰 YOUR AVAILABLE MONEY\n');
    text = text.replace(/(?:^|[\r\n])EASY-TO-ACCESS MONEY(?=$|[\r\n])/gim, '\n#### ⚡ EASY-TO-ACCESS MONEY\n');
    text = text.replace(/(?:^|[\r\n])YOUR SAFETY BACKUP(?=$|[\r\n])/gim, '\n#### 🛡️ YOUR SAFETY BACKUP\n');
    text = text.replace(/(?:^|[\r\n])SHORTFALL(?=$|[\r\n])/gim, '\n#### ⚠️ SHORTFALL ASSESSMENT\n');
    text = text.replace(/(?:^|[\r\n])POST-PURCHASE IMPACT(?=$|[\r\n])/gim, '\n#### 📊 POST-PURCHASE IMPACT\n');
    text = text.replace(/(?:^|[\r\n])KEY INSIGHTS(?=$|[\r\n])/gim, '\n#### 💡 KEY INSIGHTS\n');
    text = text.replace(/(?:^|[\r\n])STILL NEEDED(?=$|[\r\n])/gim, '\n#### ⏳ STILL NEEDED\n');

    // 6. Parse standard Markdown to HTML via marked
    let html = marked.parse(text) as string;

    // 7. Post-process Table Cells to add rich status pills & styled amounts
    html = html.replace(/<td([^>]*)>([\s\S]*?)<\/td>/gi, (match, attrs, content) => {
      const trimmed = content.trim();

      // Safe / Positive status
      if (/^(Positive|Healthy|Safe|Safe\s*\(>3m\)|Low Pressure|Well Prepared)$/i.test(trimmed)) {
        return `<td${attrs}><span class="cell-badge badge-positive"><span class="badge-dot"></span>${trimmed}</span></td>`;
      }
      // Warning / Caution status
      if (/^(Needs Caution|Caution|Manageable|Moderate|Possible|Low|Moderate Pressure|Mostly Prepared)$/i.test(trimmed)) {
        return `<td${attrs}><span class="cell-badge badge-warning"><span class="badge-dot"></span>${trimmed}</span></td>`;
      }
      // Danger / High Risk status
      if (/^(Deficit|Empty|High Risk|At Risk\s*\(<1m\)|Critical|At Risk|High Pressure|Needs Improvement|Not Prepared)$/i.test(trimmed)) {
        return `<td${attrs}><span class="cell-badge badge-danger"><span class="badge-dot"></span>${trimmed}</span></td>`;
      }
      // Not provided placeholder status
      if (/^Not provided$/i.test(trimmed)) {
        return `<td${attrs}><span class="cell-badge badge-missing"><span class="badge-dot"></span>Not provided</span></td>`;
      }
      // Loan / Tenure information
      if (/^(No loan taken|No loan|\d+\s*yrs?\s*tenure)$/i.test(trimmed)) {
        return `<td${attrs}><span class="cell-badge badge-info">${trimmed}</span></td>`;
      }
      // Currency values (starting with ₹)
      if (/^₹/.test(trimmed)) {
        return `<td${attrs} class="cell-currency">${trimmed}</td>`;
      }

      return match;
    });

    // 8. Wrap Tables in responsive styled containers
    html = html.replace(/<table>/gi, '<div class="table-card-wrapper"><table class="rich-fin-table">');
    html = html.replace(/<\/table>/gi, '</table></div>');

    // 9. Handle any remaining generic blockquotes cleanly
    html = html.replace(/<blockquote>([\s\S]*?)<\/blockquote>/gi, (_match, inner) => {
      if (inner.includes('verdict-card')) return inner;
      return `<div class="quote-callout">${inner.trim()}</div>`;
    });

    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  /**
   * Transforms raw Goal Recommendation output from Pipeline 22027 into structured executive dashboard cards
   */
  private parseGoalRecommendation(text: string): string | null {
    if (!text.includes('GOAL RECOMMENDATION') && !text.includes('GOAL AI') && !text.includes('INVESTMENT ALLOCATION')) {
      return null;
    }

    // Extract Goal Name
    const goalMatch = text.match(/Goal(?:\s*Name)?:\s*([^\r\n]+)/i);
    const goalName = goalMatch ? goalMatch[1].trim() : 'Financial Goal';

    // Extract Status
    const statusMatch = text.match(/Status:\s*([^\r\n]+)/i);
    const status = statusMatch ? statusMatch[1].trim() : 'On Track';

    // Extract Target Amount
    const targetMatch = text.match(/Target Amount:\s*([^\r\n]+)/i);
    const targetAmount = targetMatch ? targetMatch[1].trim() : '₹0';

    // Extract Current Saved
    const savedMatch = text.match(/Current Saved(?:\s*Amount)?:\s*([^\r\n]+)/i);
    const currentSaved = savedMatch ? savedMatch[1].trim() : '₹0';

    // Extract Remaining Amount
    const remainingMatch = text.match(/Remaining Amount:\s*([^\r\n]+)/i);
    const remainingAmount = remainingMatch ? remainingMatch[1].trim() : '₹0';

    // Extract Timeline
    const timelineMatch = text.match(/Timeline:\s*([^\r\n]+)/i);
    const timeline = timelineMatch ? timelineMatch[1].trim() : '—';

    // Extract Monthly Boost
    const boostMatch = text.match(/Recommended Monthly Increase:\s*([^\r\n]+)/i);
    const boost = boostMatch ? boostMatch[1].trim() : '₹5,000';

    // Extract Monthly Action description
    const actionMatch = text.match(/Action:\s*([^\r\n]+)/i);
    const action = actionMatch ? actionMatch[1].trim() : `Increase monthly savings by ${boost}.`;

    // Extract Allocations
    const equityMatch = text.match(/Equity:\s*(\d+)%?/i);
    const debtMatch = text.match(/Debt:\s*(\d+)%?/i);
    const liquidMatch = text.match(/Liquid:\s*(\d+)%?/i);

    const equity = equityMatch ? parseInt(equityMatch[1], 10) : 50;
    const debt = debtMatch ? parseInt(debtMatch[1], 10) : 40;
    const liquid = liquidMatch ? parseInt(liquidMatch[1], 10) : 10;

    // Extract Allocation Risk
    const riskMatch = text.match(/Allocation Risk:\s*([^\r\n]+)/i) || text.match(/Risk:\s*([^\r\n]+)/i);
    const risk = riskMatch ? riskMatch[1].trim() : 'Moderate';

    // Extract Allocation Assessment text (Between ALLOCATION ASSESSMENT and AI ADVISOR VIEW / FINAL RECOMMENDATION)
    let assessment = '';
    const assessBlockMatch = text.match(/ALLOCATION ASSESSMENT\s*([\s\S]*?)(?=(?:AI ADVISOR VIEW|FINAL RECOMMENDATION|$))/i);
    if (assessBlockMatch) {
      assessment = assessBlockMatch[1]
        .replace(/Allocation Risk:\s*[^\r\n]+/gi, '')
        .replace(/Risk:\s*[^\r\n]+/gi, '')
        .replace(/^[*\s\r\n#—-]+|[*\s\r\n#—-]+$/g, '')
        .trim();
    }

    // Extract AI Advisor View
    let advisorView = '';
    const advisorMatch = text.match(/AI ADVISOR VIEW\s*([\s\S]*?)(?=(?:FINAL RECOMMENDATION|$))/i);
    if (advisorMatch) {
      advisorView = advisorMatch[1]
        .replace(/^[*\s\r\n#—-]+|[*\s\r\n#—-]+$/g, '')
        .trim();
    }

    // Extract Final Recommendation
    let finalRec = '';
    const finalMatch = text.match(/FINAL RECOMMENDATION\s*([\s\S]*?)$/i);
    if (finalMatch) {
      finalRec = finalMatch[1]
        .replace(/^[*\s\r\n#—-]+|[*\s\r\n#—-]+$/g, '')
        .trim();
    }

    // Format UI states
    const isCaution = status.toLowerCase().includes('needs') || status.toLowerCase().includes('risk') || status.toLowerCase().includes('behind');
    const statusBadgeClass = isCaution ? 'status-caution' : 'status-healthy';
    const boostClean = boost.startsWith('+') ? boost : `+${boost}`;
    
    const riskClean = risk.toLowerCase();
    const riskBadgeClass = riskClean.includes('high') ? 'risk-high' : riskClean.includes('low') ? 'risk-low' : 'risk-moderate';

    return `
<div class="goal-report-container">
  <!-- 1. Hero Goal Card -->
  <div class="goal-report-hero-card">
    <div class="hero-top-row">
      <div class="hero-title-group">
        <span class="hero-label">🎯 Financial Milestone</span>
        <h3 class="hero-goal-name">${goalName}</h3>
      </div>
      <div class="hero-status-badge ${statusBadgeClass}">
        <span class="status-dot"></span>
        <span>${status}</span>
      </div>
    </div>
    <div class="goal-stats-grid">
      <div class="goal-stat-cell">
        <span class="stat-label">Target Amount</span>
        <span class="stat-val font-accent">${targetAmount}</span>
      </div>
      <div class="goal-stat-cell">
        <span class="stat-label">Current Saved</span>
        <span class="stat-val color-saved">${currentSaved}</span>
      </div>
      <div class="goal-stat-cell">
        <span class="stat-label">Remaining Gap</span>
        <span class="stat-val color-remaining">${remainingAmount}</span>
      </div>
      <div class="goal-stat-cell">
        <span class="stat-label">Timeline</span>
        <span class="stat-val">${timeline}</span>
      </div>
    </div>
  </div>

  <!-- 2. Monthly Action Card -->
  <div class="goal-monthly-action-card">
    <div class="action-icon-box">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
    </div>
    <div class="action-content">
      <div class="action-header-row">
        <span class="action-title">RECOMMENDED MONTHLY ACTION</span>
        <span class="action-boost-pill">${boostClean} / mo</span>
      </div>
      <p class="action-desc">${action}</p>
    </div>
  </div>

  <!-- 3. Investment Allocation Card -->
  <div class="goal-allocation-card">
    <div class="allocation-card-header">
      <span class="alloc-title">💼 INVESTMENT ALLOCATION & RISK</span>
      <span class="alloc-risk-badge ${riskBadgeClass}">Risk: ${risk}</span>
    </div>
    <div class="alloc-visual-bars">
      <div class="alloc-bar-segment bar-equity" style="width: ${equity}%;" title="Equity: ${equity}%">
        <span>Equity ${equity}%</span>
      </div>
      <div class="alloc-bar-segment bar-debt" style="width: ${debt}%;" title="Debt: ${debt}%">
        <span>Debt ${debt}%</span>
      </div>
      <div class="alloc-bar-segment bar-liquid" style="width: ${liquid}%;" title="Liquid: ${liquid}%">
        <span>${liquid}%</span>
      </div>
    </div>
    <div class="alloc-legend-row">
      <div class="legend-item"><span class="dot equity"></span>Equity: <strong>${equity}%</strong></div>
      <div class="legend-item"><span class="dot debt"></span>Debt: <strong>${debt}%</strong></div>
      <div class="legend-item"><span class="dot liquid"></span>Liquid: <strong>${liquid}%</strong></div>
    </div>
    ${assessment ? `
    <div class="alloc-assessment-box">
      <span class="box-icon">⚖️</span>
      <p>${assessment}</p>
    </div>` : ''}
  </div>

  <!-- 4. AI Advisor Verdict -->
  ${advisorView ? `
  <div class="advisor-verdict-card">
    <div class="advisor-card-header">
      <div class="advisor-badge">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
        <span>FinMate AI Intelligence Verdict</span>
      </div>
    </div>
    <div class="advisor-card-content">
      <p>${advisorView}</p>
    </div>
  </div>` : ''}

  <!-- 5. Final Recommendation Hero Card -->
  ${finalRec ? `
  <div class="final-recommendation-hero-card">
    <div class="rec-header">
      <span class="rec-icon">🎯</span>
      <span class="rec-title">FINAL STRATEGIC RECOMMENDATION</span>
    </div>
    <div class="rec-content">
      <p>${finalRec}</p>
    </div>
  </div>` : ''}
</div>
`;
  }

  private generateScoreCardHtml(score: number, statusText: string, title: string = 'AFFORDABILITY SCORE'): string {
    let scoreClass = 'score-healthy';
    let tierTag = 'Healthy & Prepared';
    let scoreGrad = 'healthy-gradient';

    if (score >= 80) {
      scoreClass = 'score-healthy';
      tierTag = 'Well Prepared';
      scoreGrad = 'healthy-gradient';
    } else if (score >= 60) {
      scoreClass = 'score-manageable';
      tierTag = 'Mostly Prepared';
      scoreGrad = 'manageable-gradient';
    } else if (score >= 40) {
      scoreClass = 'score-caution';
      tierTag = 'Needs Improvement';
      scoreGrad = 'caution-gradient';
    } else {
      scoreClass = 'score-risk';
      tierTag = 'High Risk / Unprepared';
      scoreGrad = 'risk-gradient';
    }

    return `\n\n<div class="affordability-score-card ${scoreClass}">
      <div class="score-left">
        <div class="score-circle ${scoreGrad}">
          <span class="score-val">${score}</span>
          <span class="score-denom">/100</span>
        </div>
      </div>
      <div class="score-right">
        <div class="score-badge-header">
          <span class="score-title">${title}</span>
          <span class="score-tier-tag">${tierTag}</span>
        </div>
        <p class="score-status-desc">${statusText}</p>
        <div class="score-meter-bar">
          <div class="score-meter-fill" style="width: ${Math.min(Math.max(score, 5), 100)}%;"></div>
        </div>
      </div>
    </div>\n\n`;
  }
}
