import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GoalsService } from '../../services/goals.service';

@Component({
  selector: 'app-create-goal-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-goal-modal.html',
  styleUrl: './create-goal-modal.scss'
})
export class CreateGoalModalComponent {
  goalsService = inject(GoalsService);

  title = '';
  targetAmount: number | null = 1000000;
  startingAmount: number | null = 250000;
  timelineYears: number = 3;
  selectedIcon: 'house' | 'car' | 'flight' | 'graduation' | 'retirement' | 'shield' = 'car';
  isSaving = signal(false);

  iconOptions = [
    { id: 'car', label: 'Car Purchase' },
    { id: 'house', label: 'Real Estate' },
    { id: 'flight', label: 'Travel / Vacation' },
    { id: 'graduation', label: 'Education' },
    { id: 'retirement', label: 'Retirement' },
    { id: 'shield', label: 'Emergency Fund' }
  ];

  close(): void {
    if (this.isSaving()) return;
    this.goalsService.closeModal();
  }

  private iconColorMap: Record<string, string> = {
    car: '#F59E0B',
    house: 'var(--color-primary)',
    flight: '#8B5CF6',
    graduation: '#EC4899',
    retirement: '#00A389',
    shield: 'var(--color-liquid)'
  };

  async onSubmit(): Promise<void> {
    if (!this.title.trim() || !this.targetAmount) return;

    this.isSaving.set(true);

    const currentYear = new Date().getFullYear();
    const targetYear = currentYear + (this.timelineYears || 3);

    try {
      await this.goalsService.addGoal({
        title: this.title.trim(),
        targetAmount: this.targetAmount,
        currentAmount: this.startingAmount || 0,
        timelineYears: this.timelineYears || 3,
        targetYear: targetYear,
        icon: this.selectedIcon,
        isPrimary: false,
        color: this.iconColorMap[this.selectedIcon] || 'var(--color-primary)'
      });

      // Reset form
      this.title = '';
      this.targetAmount = 1000000;
      this.startingAmount = 250000;
      this.timelineYears = 3;
      this.selectedIcon = 'car';
    } finally {
      this.isSaving.set(false);
    }
  }
}
