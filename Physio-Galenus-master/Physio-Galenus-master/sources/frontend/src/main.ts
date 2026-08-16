import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { AppBrowserModule } from './app/app.browser.module';
import 'hammerjs';
import { isProduction } from './app/utils/environment-utils';

if (isProduction()) {
  enableProdMode();
}

platformBrowserDynamic()
  .bootstrapModule(AppBrowserModule)
  .catch((err) => console.error(err));
