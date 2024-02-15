import { Suite, SuiteFunction, Func } from 'mocha';

export const then = (title: string, fn?: Func) => {
  if (typeof title === 'string') {
    it(title, fn);
  }
};
export const given = beforeEach;
export const when: SuiteFunction = <SuiteFunction>function (title: string, fn: (this: Suite) => void) {
  context('when ' + title, fn);
};
when.only = (title: string, fn?: (this: Suite) => void) => context.only('when ' + title, fn!);
when.skip = (title: string, fn: (this: Suite) => void) => context.skip('when ' + title, fn);
