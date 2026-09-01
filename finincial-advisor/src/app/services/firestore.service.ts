import { Injectable } from '@angular/core';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';

export interface ChatMessageData {
  id: string;
  sender: 'bot' | 'user';
  text?: string;
  showChart?: boolean;
  isTyping?: boolean;
  attachmentName?: string;
  timestamp?: string;
}

export interface TopicThreadData {
  id: string;
  title: string;
  subtext: string;
  messages: ChatMessageData[];
  prompts: string[];
  updatedAt?: any;
}

export interface FinancialDecisionRecord {
  id?: string;
  decisionType: string;
  cost?: string | number;
  affordabilityScore: number;
  scoreCategory: string; // 'Healthy & Comfortable' | 'Manageable' | 'Needs Caution' | 'High Risk'
  verdictText: string;
  userQuery?: string;
  timestamp: string;
  createdAt?: any;
}

export interface SimulatorHistoryRecord {
  id: string;
  scenarioId: string;
  scenarioTitle: string;
  score: number;
  status: string;
  monthlyExpenses: number;
  accessibleSavings: number;
  totalAssets: number;
  backupMonths: number;
  shortfall: number;
  timestamp: string;
  createdAt?: any;
}

export interface GoalItem {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  timelineYears: number;
  targetYear: number;
  icon: 'house' | 'car' | 'flight' | 'graduation' | 'retirement' | 'shield';
  status: string;
  isPrimary?: boolean;
  color?: string;
  monthlyBoost?: number;
  strategy?: string;
  updatedAt?: any;
}

@Injectable({
  providedIn: 'root'
})
export class FirestoreService {
  private db = getFirestore();

  /**
   * Save or update a conversation thread in Firestore under users/{userId}/chats/{chatId}
   */
  async saveChatThread(userId: string, thread: TopicThreadData): Promise<void> {
    if (!userId || !thread?.id) return;
    try {
      const chatDocRef = doc(this.db, 'users', userId, 'chats', thread.id);
      await setDoc(
        chatDocRef,
        {
          id: thread.id,
          title: thread.title || 'New Chat',
          subtext: thread.subtext || '',
          messages: (thread.messages || [])
            .filter(m => !m.isTyping)
            .map(m => ({
              id: m.id,
              sender: m.sender,
              text: m.text || '',
              showChart: Boolean(m.showChart),
              attachmentName: m.attachmentName || null,
              timestamp: m.timestamp || ''
            })),
          prompts: thread.prompts || [],
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    } catch (error) {
      console.error('Error saving chat to Firestore:', error);
    }
  }

  /**
   * Load all conversation threads for a user from Firestore
   */
  async loadUserChats(userId: string): Promise<TopicThreadData[]> {
    if (!userId) return [];
    try {
      const chatsColRef = collection(this.db, 'users', userId, 'chats');
      const querySnapshot = await getDocs(chatsColRef);

      const threads: TopicThreadData[] = [];
      querySnapshot.forEach(docSnap => {
        const data = docSnap.data() as any;
        threads.push({
          id: data.id || docSnap.id,
          title: data.title || 'Conversation',
          subtext: data.subtext || '',
          messages: Array.isArray(data.messages) ? data.messages : [],
          prompts: Array.isArray(data.prompts) ? data.prompts : [],
          updatedAt: data.updatedAt
        });
      });
      return threads;
    } catch (error) {
      console.warn('Could not load chats from Firestore (using local fallback):', error);
      return [];
    }
  }

  /**
   * Delete a conversation thread from Firestore
   */
  async deleteChatThread(userId: string, chatId: string): Promise<void> {
    if (!userId || !chatId) return;
    try {
      const chatDocRef = doc(this.db, 'users', userId, 'chats', chatId);
      await deleteDoc(chatDocRef);
    } catch (error) {
      console.error('Error deleting chat from Firestore:', error);
    }
  }

  /**
   * Save an assessed financial decision in Firestore under users/{userId}/decisions/{decisionId}
   */
  async saveFinancialDecision(userId: string, decision: FinancialDecisionRecord): Promise<void> {
    if (!userId) return;
    try {
      const decisionId = decision.id || `dec-${Date.now()}`;
      const docRef = doc(this.db, 'users', userId, 'decisions', decisionId);
      await setDoc(docRef, {
        ...decision,
        id: decisionId,
        createdAt: serverTimestamp()
      });
      console.log('Financial decision saved to Firestore:', decision);
    } catch (error) {
      console.error('Error saving financial decision to Firestore:', error);
    }
  }

  /**
   * Load all saved financial decisions for a user
   */
  async loadUserDecisions(userId: string): Promise<FinancialDecisionRecord[]> {
    if (!userId) return [];
    try {
      const decisionsCol = collection(this.db, 'users', userId, 'decisions');
      const querySnapshot = await getDocs(decisionsCol);

      const decisions: FinancialDecisionRecord[] = [];
      querySnapshot.forEach(docSnap => {
        decisions.push(docSnap.data() as FinancialDecisionRecord);
      });
      return decisions;
    } catch (error) {
      console.error('Error loading financial decisions from Firestore:', error);
      return [];
    }
  }

  /**
   * Save What-If Simulator analysis history to Firestore
   */
  async saveSimulatorRecord(userId: string, record: SimulatorHistoryRecord): Promise<void> {
    if (!userId || !record?.id) return;
    try {
      const docRef = doc(this.db, 'users', userId, 'simulations', record.id);
      await setDoc(docRef, {
        ...record,
        createdAt: serverTimestamp()
      });
      console.log('Simulator record saved to Firestore:', record);
    } catch (error) {
      console.error('Error saving simulator record to Firestore:', error);
    }
  }

  /**
   * Load What-If Simulator analysis history from Firestore
   */
  async loadSimulatorRecords(userId: string): Promise<SimulatorHistoryRecord[]> {
    if (!userId) return [];
    try {
      const simCol = collection(this.db, 'users', userId, 'simulations');
      const querySnapshot = await getDocs(simCol);

      const records: SimulatorHistoryRecord[] = [];
      querySnapshot.forEach(docSnap => {
        records.push(docSnap.data() as SimulatorHistoryRecord);
      });
      return records;
    } catch (error) {
      console.warn('Could not load simulator history from Firestore:', error);
      return [];
    }
  }

  /**
   * Helper to inspect a bot response and extract any financial decision record
   */
  parseDecisionFromBotResponse(botResponseText: string, userQuery: string): FinancialDecisionRecord | null {
    if (!botResponseText) return null;

    // Check for AFFORDABILITY SCORE
    const scoreMatch = botResponseText.match(/AFFORDABILITY SCORE:\s*(\d+)\s*\/\s*100/i);
    if (!scoreMatch) return null;

    const score = parseInt(scoreMatch[1], 10);

    // Extract Target / Item
    let target = 'Purchase Decision';
    const targetMatch = botResponseText.match(/Target:\s*([^•\n\r]+)/i);
    if (targetMatch && targetMatch[1]) {
      target = targetMatch[1].trim();
    } else {
      const commonItems = /(?:car|bike|iphone|phone|house|flat|laptop|macbook|vacation|trip|wedding|loan)/i;
      const matchItem = userQuery.match(commonItems);
      if (matchItem) {
        target = matchItem[0].charAt(0).toUpperCase() + matchItem[0].slice(1);
      }
    }

    // Extract Cost
    let cost: string | undefined;
    const costMatch = botResponseText.match(/Cost:\s*([^\n\r]+)/i);
    if (costMatch && costMatch[1]) {
      cost = costMatch[1].trim();
    } else {
      const amountMatch = userQuery.match(/(?:₹|\bRs\.?|\bINR)?\s*(\d+(?:\.\d+)?\s*(?:lakh|lakhs|k|cr|crore|l)?)/i);
      if (amountMatch) {
        cost = amountMatch[0].trim();
      }
    }

    // Extract Verdict
    let verdictText = 'Financial assessment complete.';
    const verdictMatch = botResponseText.match(/FINANCIAL ADVISOR\'S VERDICT[\s\S]*?(?:Recommendation:\s*)?([^\n\r]+)/i);
    if (verdictMatch && verdictMatch[1]) {
      verdictText = verdictMatch[1].replace(/^[>#*\s]+/, '').trim();
    }

    let scoreCategory = 'Healthy & Comfortable';
    if (score >= 80) scoreCategory = 'Healthy & Comfortable';
    else if (score >= 65) scoreCategory = 'Manageable';
    else if (score >= 40) scoreCategory = 'Needs Caution';
    else scoreCategory = 'High Risk';

    return {
      id: `dec-${Date.now()}`,
      decisionType: target,
      cost: cost,
      affordabilityScore: score,
      scoreCategory: scoreCategory,
      verdictText: verdictText,
      userQuery: userQuery,
      timestamp: new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    };
  }

  /**
   * Save or update a financial goal in Firestore under users/{userId}/goals/{goalId}
   */
  async saveGoal(userId: string, goal: GoalItem): Promise<void> {
    if (!userId || !goal?.id) return;
    try {
      const goalDocRef = doc(this.db, 'users', userId, 'goals', goal.id);
      await setDoc(
        goalDocRef,
        {
          id: goal.id,
          title: goal.title,
          targetAmount: Number(goal.targetAmount) || 0,
          currentAmount: Number(goal.currentAmount) || 0,
          timelineYears: Number(goal.timelineYears) || 1,
          targetYear: Number(goal.targetYear) || (new Date().getFullYear() + 3),
          icon: goal.icon || 'house',
          status: goal.status || 'On Track',
          isPrimary: Boolean(goal.isPrimary),
          color: goal.color || 'var(--color-primary)',
          monthlyBoost: goal.monthlyBoost ? Number(goal.monthlyBoost) : null,
          strategy: goal.strategy || null,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
      console.log(`Goal ${goal.id} saved to Firestore for user ${userId}`);
    } catch (error) {
      console.error('Error saving goal to Firestore:', error);
      throw error;
    }
  }

  /**
   * Save / seed all goals to Firestore in batch
   */
  async saveAllGoals(userId: string, goals: GoalItem[]): Promise<void> {
    if (!userId || !Array.isArray(goals)) return;
    try {
      for (const goal of goals) {
        await this.saveGoal(userId, goal);
      }
      console.log(`${goals.length} goals saved to Firestore for user ${userId}`);
    } catch (error) {
      console.error('Error saving all goals to Firestore:', error);
    }
  }

  /**
   * Load all goals for a user from Firestore under users/{userId}/goals
   */
  async loadUserGoals(userId: string): Promise<GoalItem[]> {
    if (!userId) return [];
    try {
      const goalsColRef = collection(this.db, 'users', userId, 'goals');
      const querySnapshot = await getDocs(goalsColRef);

      const goals: GoalItem[] = [];
      querySnapshot.forEach(docSnap => {
        const data = docSnap.data() as any;
        goals.push({
          id: data.id || docSnap.id,
          title: data.title || 'Untitled Goal',
          targetAmount: Number(data.targetAmount) || 0,
          currentAmount: Number(data.currentAmount) || 0,
          timelineYears: Number(data.timelineYears) || 1,
          targetYear: Number(data.targetYear) || (new Date().getFullYear() + 3),
          icon: data.icon || 'house',
          status: data.status || 'On Track',
          isPrimary: Boolean(data.isPrimary),
          color: data.color || 'var(--color-primary)',
          monthlyBoost: data.monthlyBoost ? Number(data.monthlyBoost) : undefined,
          strategy: data.strategy || undefined,
          updatedAt: data.updatedAt
        });
      });

      console.log(`Loaded ${goals.length} goals from Firestore for user ${userId}`);
      return goals;
    } catch (error) {
      console.warn('Could not load goals from Firestore (using fallback):', error);
      return [];
    }
  }

  /**
   * Delete a financial goal from Firestore
   */
  async deleteGoal(userId: string, goalId: string): Promise<void> {
    if (!userId || !goalId) return;
    try {
      const goalDocRef = doc(this.db, 'users', userId, 'goals', goalId);
      await deleteDoc(goalDocRef);
      console.log(`Goal ${goalId} deleted from Firestore for user ${userId}`);
    } catch (error) {
      console.error('Error deleting goal from Firestore:', error);
      throw error;
    }
  }

  /**
   * Update primary goal status across all goals for a user in Firestore
   */
  async setPrimaryGoal(userId: string, primaryGoalId: string, currentGoals: GoalItem[]): Promise<void> {
    if (!userId || !primaryGoalId) return;
    try {
      for (const g of currentGoals) {
        const isPrimary = g.id === primaryGoalId;
        const goalDocRef = doc(this.db, 'users', userId, 'goals', g.id);
        await setDoc(goalDocRef, { isPrimary: isPrimary, updatedAt: serverTimestamp() }, { merge: true });
      }
      console.log(`Set primary goal to ${primaryGoalId} in Firestore for user ${userId}`);
    } catch (error) {
      console.error('Error updating primary goal in Firestore:', error);
    }
  }
}
