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

  authMode: 'login' | 'signup' = 'login';

  emailInput = '';
  passwordInput = '';
  nameInput = '';

  switchTab(tab: 'profile' | 'auth' | 'billing'): void {
    this.authService.activeTab.set(tab);
  }

  close(): void {
    this.authService.closeModal();
  }

  toggleAuthMode(): void {
    this.authMode = this.authMode === 'login' ? 'signup' : 'login';
  }

  loginWithGoogle(): void {
    this.authService.loginWithGoogle();
  }

  onSubmitEmailAuth(): void {
    if (!this.emailInput) return;
    this.authService.userProfile.update(prof => ({
      ...prof,
      name: this.nameInput || prof.name,
      email: this.emailInput
    }));
    this.authService.isLoggedIn.set(true);
    this.authService.activeTab.set('profile');
  }

  onLogout(): void {
    this.authService.logout();
  }
}
