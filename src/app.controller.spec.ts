import { describe, it, expect } from 'vitest';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

// Plain construction instead of Nest's testing container: vitest does not
// emit the decorator metadata Nest's DI needs, and this does not need DI.
describe('AppController', () => {
  it('should return "Hello World!"', () => {
    const appController = new AppController(new AppService());
    expect(appController.getHello()).toBe('Hello World!');
  });
});
