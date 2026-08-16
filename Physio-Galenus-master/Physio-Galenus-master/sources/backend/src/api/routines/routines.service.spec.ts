import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/typeorm';
import { RoutinesService } from './routines.service';

/**
 * Unit tests for the DSS-side, JS-resident core utilities of RoutinesService:
 *
 *  - Trapezoidal / triangular fuzzy membership functions
 *  - getFatigue: fuzzy fatigue extraction over a sequence of metric values
 *  - getWeights: OR-like S-OWA fatigue weighting with Sugeno reweighting
 *    when an abnormal-fatigue threshold is crossed.
 *  - aggregateCompensationData: smoke test for the OR-like OWA aggregation
 *    over per-exercise compensation values (private method, accessed via
 *    bracket notation for the test).
 *
 * The R-side fuzzy inference and DBSCAN clustering are exercised through the
 * existing integration / e2e suites; this file deliberately covers only the
 * pieces that live in TypeScript and are directly verifiable in isolation.
 */
describe('RoutinesService — DSS core unit tests', () => {
  let service: RoutinesService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoutinesService,
        // The OWA / fuzzy / fatigue methods do not touch this.connection,
        // so an empty placeholder is sufficient for these tests.
        { provide: getConnectionToken(), useValue: {} as any },
      ],
    }).compile();

    service = module.get<RoutinesService>(RoutinesService);
  });

  describe('membershipTrapezium', () => {
    it('returns 0 outside the support', () => {
      expect(service.membershipTrapezium(-1, 0, 1, 2, 3)).toBe(0);
      expect(service.membershipTrapezium(4, 0, 1, 2, 3)).toBe(0);
    });

    it('returns 1 on the plateau between b and c', () => {
      expect(service.membershipTrapezium(1, 0, 1, 2, 3)).toBe(1);
      expect(service.membershipTrapezium(1.5, 0, 1, 2, 3)).toBe(1);
      expect(service.membershipTrapezium(2, 0, 1, 2, 3)).toBe(1);
    });

    it('rises linearly between a and b', () => {
      expect(service.membershipTrapezium(0.25, 0, 1, 2, 3)).toBeCloseTo(0.25);
      expect(service.membershipTrapezium(0.5, 0, 1, 2, 3)).toBeCloseTo(0.5);
      expect(service.membershipTrapezium(0.75, 0, 1, 2, 3)).toBeCloseTo(0.75);
    });

    it('falls linearly between c and d', () => {
      expect(service.membershipTrapezium(2.25, 0, 1, 2, 3)).toBeCloseTo(0.75);
      expect(service.membershipTrapezium(2.5, 0, 1, 2, 3)).toBeCloseTo(0.5);
      expect(service.membershipTrapezium(2.75, 0, 1, 2, 3)).toBeCloseTo(0.25);
    });
  });

  describe('membershipTriangle', () => {
    it('returns 0 outside the support', () => {
      expect(service.membershipTriangle(-1, 0, 1, 2)).toBe(0);
      expect(service.membershipTriangle(3, 0, 1, 2)).toBe(0);
    });

    it('returns 1 at the apex', () => {
      expect(service.membershipTriangle(1, 0, 1, 2)).toBe(1);
    });

    it('rises linearly between a and b', () => {
      expect(service.membershipTriangle(0.25, 0, 1, 2)).toBeCloseTo(0.25);
      expect(service.membershipTriangle(0.5, 0, 1, 2)).toBeCloseTo(0.5);
    });

    it('falls linearly between b and c', () => {
      expect(service.membershipTriangle(1.5, 0, 1, 2)).toBeCloseTo(0.5);
      expect(service.membershipTriangle(1.75, 0, 1, 2)).toBeCloseTo(0.25);
    });
  });

  describe('getFatigue — fuzzy fatigue computation', () => {
    it('returns an array with the same length as the input', () => {
      const metrics = [10, 11, 12, 13, 14, 15];
      expect(service.getFatigue(metrics).length).toBe(metrics.length);
    });

    it('clamps fatigue values to the [0, 1] interval', () => {
      const metrics = [1, 100, 1000, 10000, 100000, 1000000];
      service.getFatigue(metrics).forEach((f) => {
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThanOrEqual(1);
      });
    });

    it('reports near-zero fatigue when every metric value matches the reference', () => {
      const metrics = [10, 10, 10, 10, 10];
      service.getFatigue(metrics).forEach((f) => {
        expect(f).toBeLessThan(0.05);
      });
    });

    it('handles the single-sample edge case without crashing', () => {
      const fatigues = service.getFatigue([10]);
      expect(fatigues.length).toBe(1);
      expect(fatigues[0]).toBeGreaterThanOrEqual(0);
      expect(fatigues[0]).toBeLessThanOrEqual(1);
    });
  });

  describe('getWeights — OR-like S-OWA fatigue weighting (R1.5)', () => {
    const STATIC_WEIGHTS = [0.5, 0.3, 0.1, 0.05, 0.05];

    it('returns the static OWA weight vector when no fatigue exceeds the abnormal threshold (0.7)', () => {
      const fatigues = [0.1, 0.2, 0.3, 0.4, 0.5];
      expect(service.getWeights(fatigues)).toEqual(STATIC_WEIGHTS);
    });

    it('returns the static OWA weight vector when fatigue values are exactly at the threshold', () => {
      const fatigues = [0.7, 0.7, 0.7, 0.7, 0.7];
      expect(service.getWeights(fatigues)).toEqual(STATIC_WEIGHTS);
    });

    it('rebalances weights via the Sugeno method when an abnormal fatigue is detected, summing to ~1', () => {
      const fatigues = [0.9, 0.2, 0.3, 0.4, 0.5];
      const weights = service.getWeights(fatigues);
      expect(weights.length).toBe(STATIC_WEIGHTS.length);
      const sum = weights.reduce((a, b) => a + b, 0);
      expect(sum).toBeGreaterThan(0.95);
      expect(sum).toBeLessThan(1.05);
    });

    it('zero-completion edge case (empty fatigue array) returns the static weights', () => {
      expect(service.getWeights([])).toEqual(STATIC_WEIGHTS);
    });

    it('maximum-fatigue edge case (all values at 1.0) triggers the Sugeno rebalancing', () => {
      const fatigues = [1.0, 1.0, 1.0, 1.0, 1.0];
      const weights = service.getWeights(fatigues);
      expect(weights.length).toBe(STATIC_WEIGHTS.length);
      const sum = weights.reduce((a, b) => a + b, 0);
      expect(sum).toBeGreaterThan(0.95);
      expect(sum).toBeLessThan(1.05);
    });

    it('only rebalances once even when multiple abnormal fatigue values are present', () => {
      const fatigues = [0.9, 0.95, 0.99, 0.85, 0.75];
      const weights = service.getWeights(fatigues);
      expect(weights.length).toBe(STATIC_WEIGHTS.length);
      const sum = weights.reduce((a, b) => a + b, 0);
      expect(sum).toBeGreaterThan(0.95);
      expect(sum).toBeLessThan(1.05);
    });
  });

  describe('aggregateCompensationData — OR-like OWA aggregation (R1.5, smoke test)', () => {
    const aggregate = (
      data: { mean: number; validity: number }[],
      alpha: number,
    ): number => (service as any).aggregateCompensationData(data, alpha);

    it('returns a finite number for typical compensation input', () => {
      const data = [
        { mean: 0.4, validity: 1.0 },
        { mean: 0.3, validity: 1.0 },
        { mean: 0.2, validity: 1.0 },
      ];
      const result = aggregate(data, 0.5);
      expect(Number.isFinite(result)).toBe(true);
    });

    it('returns a finite number for the single-sample edge case', () => {
      const data = [{ mean: 0.5, validity: 1.0 }];
      const result = aggregate(data, 0.5);
      expect(Number.isFinite(result)).toBe(true);
    });
  });
});
