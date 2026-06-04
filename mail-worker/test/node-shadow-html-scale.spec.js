import { describe, expect, test } from 'vitest';
import { calculateWidthScale } from '../../mail-vue/src/components/shadow-html/scale.js';

describe('calculateWidthScale', () => {
	test('scales only by width for wide content', () => {
		expect(calculateWidthScale(500, 1000)).toBe(0.5);
	});

	test('returns null for zero-width content', () => {
		expect(calculateWidthScale(500, 0)).toBeNull();
	});

	test('allows scale above one for narrow content', () => {
		expect(calculateWidthScale(500, 250)).toBe(2);
	});
});
