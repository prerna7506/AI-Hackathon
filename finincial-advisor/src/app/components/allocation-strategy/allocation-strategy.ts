import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

interface AllocationItem {
  name: string;
  subtitle: string;
  percentage: number;
  color: string;
}

@Component({
  selector: 'app-allocation-strategy',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './allocation-strategy.html',
  styleUrl: './allocation-strategy.scss'
})
export class AllocationStrategyComponent {
  allocations: AllocationItem[] = [
    { name: 'Equity', subtitle: '(High Growth)', percentage: 60, color: 'var(--color-equity)' },
    { name: 'Debt', subtitle: '(Stability)', percentage: 30, color: 'var(--color-debt)' },
    { name: 'Liquid', subtitle: '(Emergency)', percentage: 10, color: 'var(--color-liquid)' }
  ];
}
