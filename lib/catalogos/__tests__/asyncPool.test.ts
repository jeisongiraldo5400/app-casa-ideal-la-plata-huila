import { mapWithConcurrency } from '../asyncPool';

describe('mapWithConcurrency', () => {
  it('conserva el orden de entrada', async () => {
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => value * 10);
    expect(result).toEqual([10, 20, 30, 40, 50]);
  });

  it('no supera el límite de tareas simultáneas', async () => {
    let running = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 10 }, (_, index) => index), 3, async (value) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running -= 1;
      return value;
    });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('con lista vacía no ejecuta el worker', async () => {
    const worker = jest.fn(async (value: number) => value);
    await expect(mapWithConcurrency([], 4, worker)).resolves.toEqual([]);
    expect(worker).not.toHaveBeenCalled();
  });
});
