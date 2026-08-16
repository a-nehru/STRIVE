import { Component, OnInit } from '@angular/core';
import { AuthService } from '@client-services/auth.service';
import { ConfirmDialogService } from '@client-services/confirm-dialog.service';
import { PricingPlansService } from '@client-services/pricing-plans.service';
import { EPricingPlanType } from '@common-enums/pricing-plan-type.enum';
import { FullUserDto } from '@common-response-dto/full-user.dto';
import { PricingPlansListDto } from '@common-response-dto/pricing-plans-list.dto';
import { appConfig } from '@config/app.config';

type TState = {
  isLoading: boolean;
  user?: FullUserDto;
  pricingPlans?: PricingPlansListDto;
};

@Component({
  selector: 'app-pricing',
  templateUrl: './pricing.component.html',
  styleUrls: ['./pricing.component.scss'],
})
export class PricingComponent implements OnInit {
  state: TState = {
    isLoading: false,
    user: undefined,
    pricingPlans: undefined,
  };

  imports = {
    EPricingPlanType,
  };

  constructor(
    private authService: AuthService,
    private pricingPlansService: PricingPlansService,
    private dialogService: ConfirmDialogService
  ) {
    this.state.user = this.authService.userSubject.value;
  }

  ngOnInit(): void {
    this.state.isLoading = true;
    this.pricingPlansService
      .list()
      .subscribe(
        (pricingPlansList) => (this.state.pricingPlans = pricingPlansList)
      )
      .add(async () => {
        await new Promise((f) => setTimeout(f, appConfig.minimumLoadTimeInMs));
        this.state.isLoading = false;
      });
  }

  async onSelectPlan(pricingPlan: string): Promise<void> {
    if (
      await this.dialogService.confirm(
        `Change plan for ${this.state.user?.username}`,
        `Are you sure that you want to change your current plan <strong>${this.state.user?.pricing_plan}</strong> for <strong>${pricingPlan}</strong>`
      )
    ) {
      // Do something
    }
  }
}
