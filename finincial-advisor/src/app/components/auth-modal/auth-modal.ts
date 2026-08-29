import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-auth-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth-modal.html',
  styleUrl: './auth-modal.scss'
})
export class AuthModalComponent {
  authService = inject(AuthService);

  switchTab(tab: 'profile' | 'auth'): void {
    if (tab === 'auth' && this.authService.isLoggedIn()) {
      return; // Locked while logged in
    }
    if (tab === 'profile' && !this.authService.isLoggedIn()) {
      return; // Locked while not logged in
    }
    this.authService.activeTab.set(tab);
  }

  close(): void {
    this.authService.closeModal();
  }

  loginWithGoogle(): void {
    this.authService.loginWithGoogle();
  }

  onLogout(): void {
    this.authService.logout();
  }
}
