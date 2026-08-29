import { Injectable, signal } from '@angular/core';

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

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  isModalOpen = signal(false);
  activeTab = signal<'profile' | 'auth'>('profile');
  isLoggedIn = signal(true);

  userProfile = signal<UserProfile>({
    name: 'Sophia Rodriguez',
    email: 'sophia.rodriguez@example.com',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80',
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

  openModal(tab: 'profile' | 'auth' = 'profile'): void {
    this.activeTab.set(tab);
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
  }

  loginWithGoogle(): void {
    this.isLoggedIn.set(true);
    this.userProfile.set({
      name: 'Sophia Rodriguez',
      email: 'sophia.rodriguez@gmail.com',
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80',
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
    this.activeTab.set('profile');
  }

  logout(): void {
    this.isLoggedIn.set(false);
    this.activeTab.set('auth');
  }
}
