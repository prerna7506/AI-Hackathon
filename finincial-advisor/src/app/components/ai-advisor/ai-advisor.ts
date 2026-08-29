import { Component, ElementRef, ViewChild, AfterViewChecked, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
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
export class AiAdvisorComponent implements OnInit, AfterViewChecked, OnDestroy {
  @ViewChild('chatViewport') private chatViewport!: ElementRef;
  private cdr = inject(ChangeDetectorRef);

  activeTopicId = '';
  attachedFileName: string | null = null;
  attachedFile: File | null = null;
  newMessage = '';
  shouldScrollToBottom = false;
  isLoading = false;
  private activeTimer: any = null;
  private currentTypingMsgId: string | null = null;

  topics: TopicThread[] = [];

  get currentTopic(): TopicThread {
    return this.topics.find(t => t.id === this.activeTopicId) || this.topics[0];
  }

  get hasActiveTopic(): boolean {
    return !!this.topics.find(t => t.id === this.activeTopicId);
  }

  ngOnInit(): void {
    this.startNewChat();
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
      title: 'New Chat',
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
    this.cdr.detectChanges();
  }

  usePrompt(prompt: string): void {
    this.sendMessage(prompt);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.attachedFile = input.files[0];
      this.attachedFileName = input.files[0].name;
    }
  }

  removeAttachment(): void {
    this.attachedFile = null;
    this.attachedFileName = null;
  }

  triggerFileInput(): void {
    const fileInput = document.getElementById('hiddenFileInput') as HTMLInputElement;
    if (fileInput) fileInput.click();
  }

  sendMessage(customText?: string): void {
    const text = customText || this.newMessage.trim();
    if (!text && !this.attachedFileName) return;
    if (this.isLoading) return;

    // If no active topic, create a new one first
    if (!this.hasActiveTopic) {
      this.startNewChat();
    }

    const topic = this.currentTopic;
    const attachment = this.attachedFileName;
    this.attachedFileName = null;
    this.attachedFile = null;

    // Auto-title new chats from first user message
    const isFirstUserMessage = !topic.messages.some(m => m.sender === 'user');
    if (isFirstUserMessage && text) {
      topic.title = text.length > 28 ? text.substring(0, 26) + '…' : text;
    }

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

    this.isLoading = true;
    this.shouldScrollToBottom = true;

    // Add bot typing indicator
    const typingMsgId = `typing-${Date.now()}`;
    topic.messages.push({
      id: typingMsgId,
      sender: 'bot',
      isTyping: true
    });

    this.currentTypingMsgId = typingMsgId;

    // Generate response with brief typing simulation
    this.activeTimer = setTimeout(() => {
      // Remove typing indicator
      topic.messages = topic.messages.filter(m => m.id !== typingMsgId);
      this.activeTimer = null;
      this.currentTypingMsgId = null;

      const botReplyText = this.generateAiResponse(text, attachment);

      topic.messages = [
        ...topic.messages,
        {
          id: `bot-reply-${Date.now()}`,
          sender: 'bot',
          text: botReplyText,
          timestamp: this.getFormattedTime()
        }
      ];

      // Update topic subtext with last query
      topic.subtext = text ? (text.length > 22 ? text.substring(0, 20) + '...' : text) : 'File uploaded';
      this.isLoading = false;
      this.shouldScrollToBottom = true;

      // Force Angular Change Detection update
      this.cdr.markForCheck();
      this.cdr.detectChanges();
    }, 700);
  }

  stopGeneration(): void {
    if (this.activeTimer) {
      clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }

    const topic = this.currentTopic;
    if (topic && this.currentTypingMsgId) {
      // Remove the typing indicator
      topic.messages = topic.messages.filter(m => m.id !== this.currentTypingMsgId);
      this.currentTypingMsgId = null;
    }

    if (topic) {
      // Insert a stopped-response notice
      topic.messages = [
        ...topic.messages,
        {
          id: `stopped-${Date.now()}`,
          sender: 'bot',
          text: '⏹ You stopped the response.',
          timestamp: this.getFormattedTime()
        }
      ];
    }

    this.isLoading = false;
    this.shouldScrollToBottom = true;
    this.cdr.markForCheck();
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    if (this.activeTimer) {
      clearTimeout(this.activeTimer);
    }
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
