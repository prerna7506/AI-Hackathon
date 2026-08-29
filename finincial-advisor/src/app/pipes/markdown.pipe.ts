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

    let text = String(value);

    // 1. Transform Score Block with Box-Drawing Lines (e.g. ━━━━━━━━━━━━ AFFORDABILITY SCORE: 90 / 100 ...)
    const scoreBoxRegex = /━{3,}\s*[\r\n]+AFFORDABILITY SCORE:\s*(\d+)\s*\/\s*100\s*[\r\n]+([^\r\n]+)[\r\n]+\s*━{3,}/gi;
    text = text.replace(scoreBoxRegex, (_match, scoreStr, statusText) => {
      return this.generateScoreCardHtml(parseInt(scoreStr, 10), statusText.trim());
    });

    // Also handle score block without box drawing lines
    const scoreSimpleRegex = /(?:^|[\r\n])AFFORDABILITY SCORE:\s*(\d+)\s*\/\s*100\s*[\r\n]+([^\r\n]+)/gi;
    text = text.replace(scoreSimpleRegex, (match, scoreStr, statusText) => {
      if (match.includes('affordability-score-card')) return match;
      return this.generateScoreCardHtml(parseInt(scoreStr, 10), statusText.trim());
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

    // 4. Transform Financial Advisor's Verdict into a single unified verdict card (eliminating double icon & duplicate header)
    const verdictSectionRegex = /(?:^|[\r\n])(?:#{1,4}\s*)?FINANCIAL ADVISOR\'S VERDICT\s*[\r\n]+(?:>\s*(?:Recommendation:\s*)?([^\r\n]+)|([^\r\n]+))/gi;
    text = text.replace(verdictSectionRegex, (_match, blockquoteText, plainText) => {
      const verdictContent = (blockquoteText || plainText || '').trim();
      return `\n\n<div class="verdict-card"><div class="verdict-header"><span class="verdict-title">FINANCIAL ADVISOR'S VERDICT</span></div><div class="verdict-content"><p>${verdictContent}</p></div></div>\n\n`;
    });

    // 5. Transform other Section Headers into clean headings
    text = text.replace(/(?:^|[\r\n])YOUR AFFORDABILITY SNAPSHOT(?=$|[\r\n])/gim, '\n### 🏆 YOUR AFFORDABILITY SNAPSHOT\n');
    text = text.replace(/(?:^|[\r\n])YOUR FINANCIAL DETAILS(?=$|[\r\n])/gim, '\n### 📋 YOUR FINANCIAL DETAILS\n');
    text = text.replace(/(?:^|[\r\n])POST-PURCHASE IMPACT(?=$|[\r\n])/gim, '\n#### 📊 POST-PURCHASE IMPACT\n');
    text = text.replace(/(?:^|[\r\n])KEY INSIGHTS(?=$|[\r\n])/gim, '\n#### 💡 KEY INSIGHTS\n');
    text = text.replace(/(?:^|[\r\n])STILL NEEDED(?=$|[\r\n])/gim, '\n#### ⏳ STILL NEEDED\n');

    // 6. Parse standard Markdown to HTML via marked
    let html = marked.parse(text) as string;

    // 7. Post-process Table Cells to add rich status pills & styled amounts
    html = html.replace(/<td([^>]*)>([\s\S]*?)<\/td>/gi, (match, attrs, content) => {
      const trimmed = content.trim();

      // Safe / Positive status
      if (/^(Positive|Healthy|Safe|Safe\s*\(>3m\)|Low Pressure)$/i.test(trimmed)) {
        return `<td${attrs}><span class="cell-badge badge-positive"><span class="badge-dot"></span>${trimmed}</span></td>`;
      }
      // Warning / Caution status
      if (/^(Needs Caution|Caution|Manageable|Moderate|Possible|Low|Moderate Pressure)$/i.test(trimmed)) {
        return `<td${attrs}><span class="cell-badge badge-warning"><span class="badge-dot"></span>${trimmed}</span></td>`;
      }
      // Danger / High Risk status
      if (/^(Deficit|Empty|High Risk|At Risk\s*\(<1m\)|Critical|At Risk|High Pressure)$/i.test(trimmed)) {
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

  private generateScoreCardHtml(score: number, statusText: string): string {
    let scoreClass = 'score-healthy';
    let tierTag = 'Healthy & Comfortable';
    let scoreGrad = 'healthy-gradient';

    if (score >= 80) {
      scoreClass = 'score-healthy';
      tierTag = 'Healthy & Comfortable';
      scoreGrad = 'healthy-gradient';
    } else if (score >= 65) {
      scoreClass = 'score-manageable';
      tierTag = 'Manageable';
      scoreGrad = 'manageable-gradient';
    } else if (score >= 40) {
      scoreClass = 'score-caution';
      tierTag = 'Needs Caution';
      scoreGrad = 'caution-gradient';
    } else {
      scoreClass = 'score-risk';
      tierTag = 'High Risk';
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
          <span class="score-title">AFFORDABILITY SCORE</span>
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
