import { Injectable, signal } from '@angular/core';

export interface UserProfile {
  name: string;
  email: string;
  avatarUrl: string;
  plan: string;
  healthScore: number;
  currency: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  isModalOpen = signal(false);
  activeTab = signal<'profile' | 'auth' | 'billing'>('profile');
  isLoggedIn = signal(true);

  userProfile = signal<UserProfile>({
    name: 'Sophia Rodriguez',
    email: 'sophia.rodriguez@example.com',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80',
    plan: 'FinMate Pro Member',
    healthScore: 72,
    currency: '₹ (INR)'
  });

  openModal(tab: 'profile' | 'auth' | 'billing' = 'profile'): void {
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
      plan: 'FinMate Pro Member',
      healthScore: 72,
      currency: '₹ (INR)'
    });
    this.activeTab.set('profile');
  }

  logout(): void {
    this.isLoggedIn.set(false);
    this.activeTab.set('auth');
  }
}
