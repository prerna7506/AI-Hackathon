import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { BudgetService } from '../../services/budget.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class DashboardComponent {
  authService = inject(AuthService);
  budgetService = inject(BudgetService);
  healthScore = 72;
  healthStatus = 'Good Standing';
  healthPointsChange = '+4 pts this month';

  income = '$8,450';
  expenses = '$5,210';
  expenseChange = 'Expenses down 5% vs last month';

  savings = '$124,500';
  savingsYtd = '↑ 12.4% YTD';

  activeLoans = '$14,200';
  autoLoan = '$8,500';
  nextLoanPayment = 'Next: $450 on 15th';

  downpaymentProgress = 70;
  downpaymentStatus = '12% ahead of schedule';
}
