import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BudgetService } from '../../services/budget.service';

@Component({
  selector: 'app-review-budget-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './review-budget-modal.html',
  styleUrl: './review-budget-modal.scss'
})
export class ReviewBudgetModalComponent {
  budgetService = inject(BudgetService);

  formatCurrency(value: number): string {
    return '₹' + value.toLocaleString('en-IN');
  }

  onAllocationChange(categoryId: string, event: Event): void {
    const val = Number((event.target as HTMLInputElement).value);
    this.budgetService.updateCategoryAllocation(categoryId, val);
  }

  applySmartRebalance(): void {
    this.budgetService.applySmartRebalance();
  }

  save(): void {
    this.budgetService.saveBudget();
  }

  close(): void {
    this.budgetService.closeModal();
  }
}
