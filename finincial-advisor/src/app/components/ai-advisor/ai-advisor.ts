import { Component, ElementRef, ViewChild, AfterViewChecked, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WorkflowService } from '../../services/ai-advisor.service';

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
  private aiService = inject(WorkflowService);

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

    // Submit the job, then poll GET .../result until it's done, and show the final answer.
    this.aiService.runWorkflowAndAwaitResult(text).subscribe({
      next: (response) => {
        const replyText = this.extractReplyText(response);
        if (replyText) {
          this.finishBotReply(topic, typingMsgId, replyText, text);
        }
      },
      error: (err) => {
        console.error('Workflow API call failed:', err);
        this.finishBotReply(
          topic,
          typingMsgId,
          `Sorry, I couldn't reach FinMate right now (${err.message || 'network error'}). Please try again.`,
          text
        );
      }
    });
  }

  /**
   * Pull a human-readable reply out of the final result payload from Aava workflow.
   */
  private extractReplyText(response: any): string | null {
    if (!response) return 'No response received from the workflow.';
    if (typeof response === 'string') return response;

    const data = response.data ?? response;

    // Check data.result object first (final completed payload)
    if (data.result) {
      if (typeof data.result === 'string') return data.result;

      // Check data.result.response string
      if (typeof data.result.response === 'string') {
        try {
          const parsed = JSON.parse(data.result.response);
          if (typeof parsed === 'string') return parsed;
          if (parsed?.output && typeof parsed.output === 'string') return parsed.output;
          if (parsed?.result && typeof parsed.result === 'string') return parsed.result;
          if (parsed?.raw && typeof parsed.raw === 'string') return parsed.raw;

          // Check tasksOutputs array
          if (Array.isArray(parsed?.tasksOutputs) && parsed.tasksOutputs.length > 0) {
            const lastTask = parsed.tasksOutputs[parsed.tasksOutputs.length - 1];
            if (typeof lastTask?.raw === 'string') return lastTask.raw;
            if (typeof lastTask?.output === 'string') return lastTask.output;
            if (typeof lastTask?.description === 'string') return lastTask.description;
          }

          // Check pipeLineAgents array
          if (Array.isArray(parsed?.pipeLineAgents)) {
            for (const pa of parsed.pipeLineAgents) {
              if (pa?.output && typeof pa.output === 'string') return pa.output;
              if (pa?.result && typeof pa.result === 'string') return pa.result;
            }
          }
        } catch {
          return data.result.response;
        }
      }

      // Check direct result fields
      if (typeof data.result.output === 'string' && data.result.output) return data.result.output;
      if (typeof data.result.result === 'string' && data.result.result) return data.result.result;
      if (typeof data.result.raw === 'string' && data.result.raw) return data.result.raw;
      if (typeof data.result.reply === 'string' && data.result.reply) return data.result.reply;
      if (typeof data.result.message === 'string' && data.result.message) return data.result.message;
      if (typeof data.result.answer === 'string' && data.result.answer) return data.result.answer;

      // Check CrewAI tasks_output array
      if (Array.isArray(data.result.tasks_output) && data.result.tasks_output.length > 0) {
        const lastTask = data.result.tasks_output[data.result.tasks_output.length - 1];
        if (typeof lastTask?.raw === 'string') return lastTask.raw;
        if (typeof lastTask?.output === 'string') return lastTask.output;
        if (typeof lastTask?.description === 'string') return lastTask.description;
      }
    }

    // Direct string fields on data
    if (typeof data.reply === 'string' && data.reply) return data.reply;
    if (typeof data.output === 'string' && data.output) return data.output;
    if (typeof data.message === 'string' && data.message) return data.message;
    if (typeof data.answer === 'string' && data.answer) return data.answer;

    // Block intermediate statuses
    const innerStatus = (data?.status ?? response?.data?.status ?? '').toString().toUpperCase().trim();
    if (['QUEUED', 'IN_PROGRESS', 'RUNNING', 'PENDING', 'STARTED', 'INITIALIZING', 'PROCESSING'].includes(innerStatus)) {
      return null;
    }

    return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  }

  private finishBotReply(topic: TopicThread, typingMsgId: string, botReplyText: string | null, originalQuery: string): void {
    // Remove typing indicator
    topic.messages = topic.messages.filter(m => m.id !== typingMsgId);
    this.currentTypingMsgId = null;

    // ✅ FIXED: Only add bot message if text is not null
    if (botReplyText) {
      topic.messages = [
        ...topic.messages,
        {
          id: `bot-reply-${Date.now()}`,
          sender: 'bot',
          text: botReplyText,
          timestamp: this.getFormattedTime()
        }
      ];
    }

    // Update topic subtext with last query
    topic.subtext = originalQuery
      ? originalQuery.length > 22
        ? originalQuery.substring(0, 20) + '...'
        : originalQuery
      : 'File uploaded';

    this.isLoading = false;
    this.shouldScrollToBottom = true;

    this.cdr.markForCheck();
    this.cdr.detectChanges();
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