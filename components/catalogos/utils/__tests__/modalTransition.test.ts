import { IOS_MODAL_DISMISS_MS, waitForModalDismissal } from '../modalTransition';

describe('waitForModalDismissal', () => {
  afterEach(() => jest.useRealTimers());

  it('en Android no espera', async () => {
    await expect(waitForModalDismissal('android')).resolves.toBeUndefined();
  });

  it('en iOS espera a que el modal anterior se retire', async () => {
    jest.useFakeTimers();
    const done = jest.fn();
    void waitForModalDismissal('ios').then(done);

    jest.advanceTimersByTime(IOS_MODAL_DISMISS_MS - 1);
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    await Promise.resolve();
    expect(done).toHaveBeenCalled();
  });
});
