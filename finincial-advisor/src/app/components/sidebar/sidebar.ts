import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

interface NavItem {
  id: string;
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss'
})
export class SidebarComponent {
  authService = inject(AuthService);

  navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: 'grid', route: '/dashboard' },
    { id: 'advisor', label: 'AI Advisor', icon: 'bot', route: '/ai-advisor' },
    { id: 'goals', label: 'Goals', icon: 'flag', route: '/goals' },
    { id: 'simulator', label: 'Simulator', icon: 'trending', route: '/simulator' }
  ];

  openProfile(): void {
    if (this.authService.isLoggedIn()) {
      this.authService.openModal('profile');
    } else {
      this.authService.openModal('auth');
    }
  }

  openAuth(): void {
    if (this.authService.isLoggedIn()) {
      this.authService.logout();
    } else {
      this.authService.openModal('auth');
    }
  }
}
