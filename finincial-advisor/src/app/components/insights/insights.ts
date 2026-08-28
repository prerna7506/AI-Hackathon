import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { BudgetService } from '../../services/budget.service';

interface FilterChip {
  id: string;
  label: string;
  selected?: boolean;
}

@Component({
  selector: 'app-insights',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './insights.html',
  styleUrl: './insights.scss'
})
export class InsightsComponent {
  authService = inject(AuthService);
  budgetService = inject(BudgetService);
  filters: FilterChip[] = [
    { id: 'all', label: 'All', selected: true },
    { id: 'alerts', label: 'Alerts' },
    { id: 'opportunities', label: 'Opportunities' },
    { id: 'goals', label: 'Goals' }
  ];

  totalInflow = '₹1,24,000';
  totalOutflow = '₹98,500';
  netSavings = '₹25,500';

  selectFilter(id: string): void {
    this.filters.forEach(f => f.selected = (f.id === id));
  }
}
