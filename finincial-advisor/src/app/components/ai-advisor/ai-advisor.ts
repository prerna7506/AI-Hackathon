import { Component, ElementRef, ViewChild, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface ChatMessage {
  id: string;
  sender: 'bot' | 'user';
  text?: string;
  showChart?: boolean;
  isTyping?: boolean;
  attachmentName?: string;
  timestamp?: string;
}

interface TopicThread {
  id: string;
  title: string;
  subtext: string;
  messages: ChatMessage[];
  prompts: string[];
}

@Component({
  selector: 'app-ai-advisor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-advisor.html',
  styleUrl: './ai-advisor.scss'
})
export class AiAdvisorComponent implements AfterViewChecked {
  @ViewChild('chatViewport') private chatViewport!: ElementRef;

  activeTopicId = 'car-analysis';
  attachedFileName: string | null = null;
  newMessage = '';
  shouldScrollToBottom = false;

  topics: TopicThread[] = [
    {
      id: 'car-analysis',
      title: 'Car Purchase Analysis',
      subtext: 'Based on your cash flow',
      prompts: ['Can I afford a car?', 'Analyze my spending', 'Increase down payment to 20%'],
      messages: [
        {
          id: 'msg-1',
          sender: 'bot',
          text: 'Based on your current finances, purchasing the car next year may put pressure on your monthly cash flow. Here is a breakdown of the projected impact.',
          showChart: true,
          timestamp: '10:42 AM'
        },
        {
          id: 'msg-2',
          sender: 'user',
          text: 'What if I put down a larger down payment?',
          timestamp: '10:43 AM'
        }
      ]
    },
    {
      id: 'tax-saving',
      title: 'Tax Saving Tips',
      subtext: 'Consider Sec 80C & ELSS',
      prompts: ['Best ELSS Funds', 'NPS Tax Benefit', 'How to save ₹46,800 tax?'],
      messages: [
        {
          id: 'msg-tax-1',
          sender: 'bot',
          text: 'FinMate AI Tax Advisor: You still have ₹65,000 remaining in your Section 80C limit for this financial year. Investing in ELSS mutual funds can save you up to ₹20,280 in tax.',
          timestamp: 'Yesterday'
        }
      ]
    },
    {
      id: 'emergency-fund',
      title: 'Emergency Fund Review',
      subtext: 'You currently have 3 months',
      prompts: ['Where to keep liquid cash?', 'Top Liquid Funds 2026', 'Auto-sweep savings accounts'],
      messages: [
        {
          id: 'msg-em-1',
          sender: 'bot',
          text: 'FinMate AI Emergency Review: Your liquid balance of ₹2,25,000 covers 3 months of essential expenses. We recommend boosting this to 6 months (₹4,50,000).',
          timestamp: '2 days ago'
        }
      ]
    }
  ];

  get currentTopic(): TopicThread {
    return this.topics.find(t => t.id === this.activeTopicId) || this.topics[0];
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  selectTopic(id: string): void {
    this.activeTopicId = id;
    this.shouldScrollToBottom = true;
  }

  startNewChat(): void {
    const newId = `chat-${Date.now()}`;
    const newTopic: TopicThread = {
      id: newId,
      title: 'New Financial Consultation',
      subtext: 'Just started',
      prompts: ['Review my portfolio', 'How much can I invest monthly?', 'Retirement Planning'],
      messages: [
        {
          id: `bot-start-${Date.now()}`,
          sender: 'bot',
          text: 'Hello! I am your FinMate AI Financial Partner. How can I assist you with your wealth, budget, or investment goals today?',
          timestamp: this.getFormattedTime()
        }
      ]
    };
    this.topics.unshift(newTopic);
    this.activeTopicId = newId;
    this.shouldScrollToBottom = true;
  }

  usePrompt(prompt: string): void {
    this.sendMessage(prompt);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.attachedFileName = input.files[0].name;
    }
  }

  removeAttachment(): void {
    this.attachedFileName = null;
  }

  triggerFileInput(): void {
    const fileInput = document.getElementById('hiddenFileInput') as HTMLInputElement;
    if (fileInput) fileInput.click();
  }

  sendMessage(customText?: string): void {
    const text = customText || this.newMessage.trim();
    if (!text && !this.attachedFileName) return;

    const topic = this.currentTopic;
    const attachment = this.attachedFileName;
    this.attachedFileName = null;

    // Add user message
    topic.messages.push({
      id: `user-${Date.now()}`,
      sender: 'user',
      text: text,
      attachmentName: attachment || undefined,
      timestamp: this.getFormattedTime()
    });

    if (!customText) {
      this.newMessage = '';
    }

    this.shouldScrollToBottom = true;

    // Add bot typing indicator
    const typingMsgId = `typing-${Date.now()}`;
    topic.messages.push({
      id: typingMsgId,
      sender: 'bot',
      isTyping: true
    });

    // Generate intelligent AI response after delay
    setTimeout(() => {
      // Remove typing indicator
      topic.messages = topic.messages.filter(m => m.id !== typingMsgId);

      const botReplyText = this.generateAiResponse(text, attachment);
      topic.messages.push({
        id: `bot-reply-${Date.now()}`,
        sender: 'bot',
        text: botReplyText,
        timestamp: this.getFormattedTime()
      });

      // Update topic subtext with last query
      topic.subtext = text ? (text.length > 22 ? text.substring(0, 20) + '...' : text) : 'File uploaded';
      this.shouldScrollToBottom = true;
    }, 1400);
  }

  private generateAiResponse(query: string, attachmentName?: string | null): string {
    const q = query.toLowerCase();

    if (attachmentName) {
      return `I've analyzed your uploaded document "${attachmentName}". Your recurring monthly subscriptions total ₹4,200 and your average net savings margin is 37.5%. Excellent stability!`;
    }

    if (q.includes('down payment') || q.includes('larger') || q.includes('increase') || q.includes('20%')) {
      return 'Increasing your down payment to 20% (₹2,00,000) reduces your monthly EMI from ₹18,500 to ₹14,200. This frees up ₹4,300/month in your cash flow and saves ₹78,000 in total interest over a 5-year tenure!';
    } else if (q.includes('afford') || q.includes('car') || q.includes('vehicle') || q.includes('buy')) {
      return 'Based on your net monthly savings of ₹45,000, a car priced up to ₹10,00,000 is well within your safe threshold provided your monthly EMI does not exceed 15% of your gross income.';
    } else if (q.includes('spend') || q.includes('analyze') || q.includes('expense') || q.includes('dining')) {
      return 'FinMate AI Spending Breakdown: Your top expense category this month is Dining Out (₹18,500), which is 24% higher than your 6-month average. Reallocating ₹5,000 to your House Downpayment goal will accelerate your target by 4 months.';
    } else if (q.includes('tax') || q.includes('elss') || q.includes('80c') || q.includes('nps')) {
      return 'Tax Optimization Strategy: To maximize your tax savings under Sec 80C (₹1,50,000 limit), invest in high-performing ELSS funds. Additionally, an extra ₹50,000 in NPS under Sec 80CCD(1B) provides an extra ₹15,600 tax benefit!';
    } else if (q.includes('emergency') || q.includes('liquid') || q.includes('fund') || q.includes('safety')) {
      return 'Emergency Cushion Analysis: Your current liquid fund stands at ₹2,25,000 (3 months). We recommend setting up an automated sweep-in deposit of ₹15,000/mo to reach your target of ₹4,50,000 (6 months).';
    } else if (q.includes('invest') || q.includes('sip') || q.includes('portfolio') || q.includes('equity')) {
      return 'Investment Portfolio Insights: Your current asset allocation is 60% Equity, 30% Debt, and 10% Liquid. Increasing your equity SIP by ₹5,000/mo at a 12% CAGR will compound to ₹4.1 Lakhs extra in 5 years.';
    } else {
      return `FinMate AI Insights: I've processed your financial query about "${query}". Your current financial health score is 72/100 (Good Standing). You can also simulate this scenario directly in the What-If Simulator!`;
    }
  }

  private scrollToBottom(): void {
    try {
      if (this.chatViewport) {
        this.chatViewport.nativeElement.scrollTop = this.chatViewport.nativeElement.scrollHeight;
      }
    } catch (err) {}
  }

  private getFormattedTime(): string {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}
