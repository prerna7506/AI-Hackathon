import { Routes } from '@angular/router';
import { DashboardComponent } from './components/dashboard/dashboard';
import { AiAdvisorComponent } from './components/ai-advisor/ai-advisor';
import { FinancialGoalsComponent } from './components/financial-goals/financial-goals';
import { SimulatorComponent } from './components/simulator/simulator';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'ai-advisor', component: AiAdvisorComponent },
  { path: 'goals', component: FinancialGoalsComponent },
  { path: 'simulator', component: SimulatorComponent },
  { path: '**', redirectTo: 'dashboard' }
];
