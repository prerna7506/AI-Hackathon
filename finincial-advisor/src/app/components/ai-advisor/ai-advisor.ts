import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewChecked,
  OnInit,
  OnDestroy,
  inject,
  ChangeDetectorRef,
  effect,
  untracked
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { FirestoreService, TopicThreadData } from '../../services/firestore.service';
import { WorkflowService } from '../../services/ai-advisor.service';
import { MarkdownPipe } from '../../pipes/markdown.pipe';

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
  imports: [CommonModule, FormsModule, MarkdownPipe],
  templateUrl: './ai-advisor.html',
  styleUrl: './ai-advisor.scss'
})
export class AiAdvisorComponent implements OnInit, AfterViewChecked, OnDestroy {
  @ViewChild('chatViewport') private chatViewport!: ElementRef;
  @ViewChild('messageTextarea') private messageTextarea?: ElementRef<HTMLTextAreaElement>;
  private cdr = inject(ChangeDetectorRef);
  private aiService = inject(WorkflowService);
  private firestoreService = inject(FirestoreService);
  authService = inject(AuthService);

  activeTopicId = 'chat-init';
  attachedFileName: string | null = null;
  attachedFile: File | null = null;
  newMessage = '';
  shouldScrollToBottom = false;
  isLoading = false;
  private activeTimer: any = null;
  private currentTypingMsgId: string | null = null;

  topics: TopicThread[] = [
    {
      id: 'chat-init',
      title: 'New Chat',
      subtext: 'Just started',
      prompts: [
        'Can I afford a car for ₹8 Lakh?',
        'Can I buy an iPhone for ₹1.5 Lakh?',
        'Can I afford a ₹50 Lakh home loan?',
        'Can I afford a ₹2 Lakh vacation?'
      ],
      messages: [
        {
          id: 'bot-start-init',
          sender: 'bot',
          text: 'Hello! I am your FinMate Financial Decision Advisor. Tell me about any purchase or financial decision you are planning, and I will help you answer: "Can I afford this?"',
          timestamp: 'Just now'
        }
      ]
    }
  ];

  get currentTopic(): TopicThread {
    return this.topics.find(t => t.id === this.activeTopicId) || this.topics[0];
  }

  get hasActiveTopic(): boolean {
    return this.topics.length > 0;
  }

  constructor() {
    effect(() => {
      const uid = this.authService.currentUserId();
      const isLoggedIn = this.authService.isLoggedIn();
      untracked(() => {
        if (isLoggedIn && uid) {
          this.loadChatsFromFirestore(uid);
        } else if (!isLoggedIn && !this.authService.isAuthChecking()) {
          this.topics = [this.createDefaultThread('chat-guest')];
          this.activeTopicId = 'chat-guest';
        }
      });
    });
  }

  ngOnInit(): void {
    const uid = this.authService.currentUserId();
    if (uid && this.authService.isLoggedIn()) {
      this.loadChatsFromFirestore(uid);
    }
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  private createDefaultThread(id: string = `chat-${Date.now()}`): TopicThread {
    return {
      id: id,
      title: 'New Chat',
      subtext: 'Just started',
      prompts: [
        'Can I afford a car for ₹8 Lakh?',
        'Can I buy an iPhone for ₹1.5 Lakh?',
        'Can I afford a ₹50 Lakh home loan?',
        'Can I afford a ₹2 Lakh vacation?'
      ],
      messages: [
        {
          id: `bot-start-${id}`,
          sender: 'bot',
          text: 'Hello! I am your FinMate Financial Decision Advisor. Tell me about any purchase or financial decision you are planning, and I will help you answer: "Can I afford this?"',
          timestamp: this.getFormattedTime()
        }
      ]
    };
  }

  async loadChatsFromFirestore(uid: string): Promise<void> {
    try {
      const userChats = await this.firestoreService.loadUserChats(uid);
      if (userChats && userChats.length > 0) {
        this.topics = userChats;
        this.activeTopicId = this.topics[0].id;
      } else {
        const initial = this.createDefaultThread(`chat-${Date.now()}`);
        this.topics = [initial];
        this.activeTopicId = initial.id;
        this.firestoreService.saveChatThread(uid, initial);
      }
      this.shouldScrollToBottom = true;
      this.cdr.detectChanges();
    } catch (error) {
      console.warn('Failed to load user chats from Firestore:', error);
      if (this.topics.length === 0) {
        const fallback = this.createDefaultThread('chat-fallback');
        this.topics = [fallback];
        this.activeTopicId = fallback.id;
      }
      this.cdr.detectChanges();
    }
  }

  selectTopic(id: string): void {
    this.activeTopicId = id;
    this.shouldScrollToBottom = true;
  }

  editingTopicId: string | null = null;
  editingTitle: string = '';

  startRenaming(topic: TopicThread, event: MouseEvent): void {
    event.stopPropagation();
    this.editingTopicId = topic.id;
    this.editingTitle = topic.title;
  }

  saveRename(topic: TopicThread): void {
    const trimmed = this.editingTitle.trim();
    if (trimmed && trimmed !== topic.title) {
      topic.title = trimmed;
      const uid = this.authService.currentUserId();
      if (uid) {
        this.firestoreService.saveChatThread(uid, topic);
      }
    }
    this.editingTopicId = null;
    this.editingTitle = '';
    this.cdr.detectChanges();
  }

  cancelRename(): void {
    this.editingTopicId = null;
    this.editingTitle = '';
    this.cdr.detectChanges();
  }

  deleteTopic(topicId: string, event: MouseEvent): void {
    event.stopPropagation();

    const index = this.topics.findIndex(t => t.id === topicId);
    if (index === -1) return;

    this.topics = this.topics.filter(t => t.id !== topicId);

    // If deleted the active topic, switch to another or create a new one
    if (this.activeTopicId === topicId) {
      if (this.topics.length > 0) {
        this.activeTopicId = this.topics[0].id;
      } else {
        this.startNewChat(true);
      }
    }

    const uid = this.authService.currentUserId();
    if (uid) {
      this.firestoreService.deleteChatThread(uid, topicId);
    }

    this.cdr.detectChanges();
  }

  startNewChat(saveToFirestore: boolean = true): void {
    const newTopic = this.createDefaultThread(`chat-${Date.now()}`);
    this.topics.unshift(newTopic);
    this.activeTopicId = newTopic.id;
    this.shouldScrollToBottom = true;

    const uid = this.authService.currentUserId();
    if (saveToFirestore && uid) {
      this.firestoreService.saveChatThread(uid, newTopic);
    }

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

  openSignInModal(): void {
    this.authService.openModal('auth');
  }

  triggerFileInput(): void {
    const fileInput = document.getElementById('hiddenFileInput') as HTMLInputElement;
    if (fileInput) fileInput.click();
  }

  adjustTextareaHeight(event?: Event): void {
    const textarea = event ? (event.target as HTMLTextAreaElement) : this.messageTextarea?.nativeElement;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.max(textarea.scrollHeight, 24)}px`;
    }
  }

  onTextareaKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  resetTextareaHeight(): void {
    if (this.messageTextarea?.nativeElement) {
      this.messageTextarea.nativeElement.style.height = 'auto';
    }
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
      this.resetTextareaHeight();
    }

    // Persist user message to Firestore
    const uid = this.authService.currentUserId();
    if (uid) {
      this.firestoreService.saveChatThread(uid, topic);
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

    // Build conversational context so the AI remembers previous items (e.g. 'car' + '1.5L')
    const contextualPrompt = this.buildFullConversationContext(topic, text);

    // Submit the job with full conversational context, then poll GET .../result until it's done
    this.aiService.runWorkflowAndAwaitResult(contextualPrompt).subscribe({
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
   * Builds the conversation history transcript so the stateless workflow agent
   * remembers all parameters (item, cost, income, savings) across multiple turns.
   */
  private buildFullConversationContext(topic: TopicThread, latestText: string): string {
    const validMessages = topic.messages
      .filter(m => !m.isTyping && m.text && !m.id.startsWith('bot-start'));

    if (validMessages.length <= 1) {
      return latestText;
    }

    // Combine recent conversation turns
    const history = validMessages.map(m => {
      if (m.sender === 'user') {
        return `User: ${m.text}`;
      } else {
        // Extract key questions or clean summary from the advisor
        const lines = (m.text || '')
          .split('\n')
          .map(l => l.trim())
          .filter(l => l.length > 0 && !l.startsWith('|') && !l.startsWith('━') && !l.startsWith('---'));
        const lastQuestion = lines.filter(l => l.endsWith('?')).pop() || lines[lines.length - 1] || '';
        return `Advisor: ${lastQuestion}`;
      }
    }).join('\n');

    return history;
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
            }
          }
        } catch {
          // If not JSON, use the raw string
          return data.result.response;
        }
      }

      if (typeof data.result.text === 'string') return data.result.text;
      if (typeof data.result.message === 'string') return data.result.message;
      if (typeof data.result.content === 'string') return data.result.content;
    }

    // Check data.response / data.output directly
    if (typeof data.response === 'string') return data.response;
    if (typeof data.output === 'string') return data.output;
    if (typeof data.message === 'string' && data.status === 'COMPLETED') return data.message;
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
      : 'Decision query';

    this.isLoading = false;
    this.shouldScrollToBottom = true;

    // Persist bot reply and extracted financial decision to Firestore
    const uid = this.authService.currentUserId();
    if (uid) {
      this.firestoreService.saveChatThread(uid, topic);

      if (botReplyText) {
        const decision = this.firestoreService.parseDecisionFromBotResponse(botReplyText, originalQuery);
        if (decision) {
          this.firestoreService.saveFinancialDecision(uid, decision);
        }
      }
    }

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
      topic.messages = topic.messages.filter(m => m.id !== this.currentTypingMsgId);
      this.currentTypingMsgId = null;
    }

    if (topic) {
      topic.messages = [
        ...topic.messages,
        {
          id: `stopped-${Date.now()}`,
          sender: 'bot',
          text: 'You stopped the response.',
          timestamp: this.getFormattedTime()
        }
      ];

      const uid = this.authService.currentUserId();
      if (uid) {
        this.firestoreService.saveChatThread(uid, topic);
      }
    }

    this.isLoading = false;
    this.shouldScrollToBottom = true;
    this.cdr.detectChanges();
  }

  private scrollToBottom(): void {
    try {
      if (this.chatViewport?.nativeElement) {
        this.chatViewport.nativeElement.scrollTop = this.chatViewport.nativeElement.scrollHeight;
      }
    } catch (err) {
      console.warn('Scroll error:', err);
    }
  }

  private getFormattedTime(): string {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  ngOnDestroy(): void {
    if (this.activeTimer) {
      clearTimeout(this.activeTimer);
    }
  }
}