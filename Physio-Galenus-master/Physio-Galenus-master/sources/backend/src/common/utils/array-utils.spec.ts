import { getArrayWithoutUndefinedElements } from './array-utils';

describe('array-utils testing', () => {
  describe('getArrayWithoutUndefinedElements function', () => {
    const array = [0, 1, null, 2, undefined, 3, , , , , , 4, , 5, , 6, , , , ,];
    it('should return correct result', () => {
      const normalizedArray = getArrayWithoutUndefinedElements(array);
      expect(normalizedArray).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });
    it('should return incorrect result', () => {
      const normalizedArray = getArrayWithoutUndefinedElements(array);
      expect(normalizedArray).not.toEqual(array);
    });
  });
});
