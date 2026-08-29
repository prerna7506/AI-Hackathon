import { Injectable, signal } from '@angular/core';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';

export interface AppFeature {
  name: string;
  desc: string;
  icon: string;
  status: string;
}

export interface UserProfile {
  name: string;
  email: string;
  avatarUrl: string;
  memberSince: string;
  memberTill: string;
  membershipStatus: string;
  activeFeatures: AppFeature[];
}

const firebaseConfig = {
  apiKey: "AIzaSyAQjj5Ox5l2dsUaTFYLeDi7vXEMy5NaOYo",
  authDomain: "finicialadvisor.firebaseapp.com",
  projectId: "finicialadvisor",
  storageBucket: "finicialadvisor.firebasestorage.app",
  messagingSenderId: "853206928944",
  appId: "1:853206928944:web:87e8a65ceb7813683ba7f5",
  measurementId: "G-C2S1MKGJNY"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

function getInitialProfile(): UserProfile {
  try {
    const cached = localStorage.getItem('finmate_user_profile');
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {}
  return {
    name: 'Guest User',
    email: 'guest@finmate.ai',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
    memberSince: 'August 2026',
    memberTill: 'December 31, 2026',
    membershipStatus: 'Active Pro Access',
    activeFeatures: [
      {
        name: 'AI Financial Decision Helper',
        desc: 'Instant purchase affordability scores and advisor verdicts',
        icon: '🛡️',
        status: 'Active'
      },
      {
        name: 'Smart Expense & EMI Modeling',
        desc: 'Real-time post-purchase budget and liquidity impact calculations',
        icon: '📊',
        status: 'Active'
      },
      {
        name: 'Unlimited Advisor Consultations',
        desc: 'Multi-scenario interactive conversations & financial health checks',
        icon: '💬',
        status: 'Active'
      }
    ]
  };
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private auth = auth;

  isModalOpen = signal(false);
  activeTab = signal<'profile' | 'auth'>('profile');
  isLoggedIn = signal(typeof window !== 'undefined' && localStorage.getItem('finmate_logged_in') === 'true');
  isAuthChecking = signal(true);
  isAuthenticating = signal(false);
  authError = signal<string | null>(null);
  currentUser = signal<User | null>(null);
  currentUserId = signal<string | null>(typeof window !== 'undefined' ? localStorage.getItem('finmate_user_uid') : null);

  userProfile = signal<UserProfile>(getInitialProfile());

  constructor() {
    onAuthStateChanged(this.auth, (user: User | null) => {
      this.isAuthChecking.set(false);
      this.currentUser.set(user);
      this.currentUserId.set(user?.uid || null);
      if (user) {
        try {
          localStorage.setItem('finmate_logged_in', 'true');
          localStorage.setItem('finmate_user_uid', user.uid);
        } catch {}
        this.updateUserFromFirebase(user);
        this.isLoggedIn.set(true);
      } else {
        try {
          localStorage.removeItem('finmate_logged_in');
          localStorage.removeItem('finmate_user_uid');
          localStorage.removeItem('finmate_user_profile');
        } catch {}
        this.isLoggedIn.set(false);
      }
    });
  }

  private updateUserFromFirebase(user: User): void {
    const creationTime = user.metadata.creationTime;
    let memberSinceFormatted = 'August 2026';
    if (creationTime) {
      const d = new Date(creationTime);
      memberSinceFormatted = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    const profile: UserProfile = {
      name: user.displayName || 'FinMate User',
      email: user.email || 'user@gmail.com',
      avatarUrl:
        user.photoURL ||
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
      memberSince: memberSinceFormatted,
      memberTill: 'December 31, 2026',
      membershipStatus: 'Active Pro Access',
      activeFeatures: [
        {
          name: 'AI Financial Decision Helper',
          desc: 'Instant purchase affordability scores and advisor verdicts',
          icon: '🛡️',
          status: 'Active'
        },
        {
          name: 'Smart Expense & EMI Modeling',
          desc: 'Real-time post-purchase budget and liquidity impact calculations',
          icon: '📊',
          status: 'Active'
        },
        {
          name: 'Unlimited Advisor Consultations',
          desc: 'Multi-scenario interactive conversations & financial health checks',
          icon: '💬',
          status: 'Active'
        }
      ]
    };

    try {
      localStorage.setItem('finmate_user_profile', JSON.stringify(profile));
    } catch {}

    this.userProfile.set(profile);
  }

  openModal(tab: 'profile' | 'auth' = 'profile'): void {
    this.authError.set(null);
    if (!this.isLoggedIn()) {
      this.activeTab.set('auth');
    } else {
      this.activeTab.set('profile');
    }
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
  }

  async loginWithGoogle(): Promise<void> {
    try {
      this.authError.set(null);
      this.isAuthenticating.set(true);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(this.auth, provider);
      if (result.user) {
        this.updateUserFromFirebase(result.user);
        this.isLoggedIn.set(true);
        this.activeTab.set('profile');
      }
    } catch (error: any) {
      console.error('Google Sign-In Error:', error);
      if (error?.code !== 'auth/popup-closed-by-user') {
        this.authError.set(error?.message || 'Authentication failed. Please try again.');
      }
    } finally {
      this.isAuthenticating.set(false);
    }
  }

  async logout(): Promise<void> {
    try {
      await signOut(this.auth);
      this.isLoggedIn.set(false);
      this.userProfile.set({
        name: 'Guest User',
        email: 'guest@finmate.ai',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
        memberSince: 'August 2026',
        memberTill: 'December 31, 2026',
        membershipStatus: 'Active Pro Access',
        activeFeatures: [
          {
            name: 'AI Financial Decision Helper',
            desc: 'Instant purchase affordability scores and advisor verdicts',
            icon: '🛡️',
            status: 'Active'
          },
          {
            name: 'Smart Expense & EMI Modeling',
            desc: 'Real-time post-purchase budget and liquidity impact calculations',
            icon: '📊',
            status: 'Active'
          },
          {
            name: 'Unlimited Advisor Consultations',
            desc: 'Multi-scenario interactive conversations & financial health checks',
            icon: '💬',
            status: 'Active'
          }
        ]
      });
      this.activeTab.set('auth');
      try {
        localStorage.removeItem('finmate_logged_in');
        localStorage.removeItem('finmate_user_uid');
        localStorage.removeItem('finmate_user_profile');
      } catch {}
    } catch (error) {
      console.error('Sign-Out Error:', error);
    }
  }
}
