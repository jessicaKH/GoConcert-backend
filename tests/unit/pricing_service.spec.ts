import { test } from '@japa/runner'
import PricingService from '#services/pricing_service'

test.group('PricingService.haversineKm', () => {
  test('Paris → Lyon is roughly 390–410 km', ({ assert }) => {
    const dist = PricingService.haversineKm(48.8566, 2.3522, 45.748, 4.8467)
    assert.isAbove(dist, 380)
    assert.isBelow(dist, 420)
  })

  test('same point returns 0', ({ assert }) => {
    assert.equal(PricingService.haversineKm(48.8566, 2.3522, 48.8566, 2.3522), 0)
  })

  test('is symmetric', ({ assert }) => {
    const ab = PricingService.haversineKm(43.2965, 5.3698, 44.8378, -0.5792)
    const ba = PricingService.haversineKm(44.8378, -0.5792, 43.2965, 5.3698)
    assert.approximately(ab, ba, 0.001)
  })
})

test.group('PricingService.estimatePrice', () => {
  test('short trip stays at minimum price floor', ({ assert }) => {
    const { min, max } = PricingService.estimatePrice(5)
    assert.isAtLeast(min, 2)
    assert.isAtLeast(max, min)
  })

  test('long trip is capped at max price', ({ assert }) => {
    const { min, max } = PricingService.estimatePrice(1000)
    assert.isAtMost(max, 50)
    assert.isAtLeast(min, 2)
  })

  test('min is always <= max', ({ assert }) => {
    for (const km of [0, 10, 50, 200, 500, 1000]) {
      const { min, max } = PricingService.estimatePrice(km)
      assert.isAtMost(min, max, `min > max at ${km}km`)
    }
  })

  test('prices are rounded to nearest 0.50', ({ assert }) => {
    const { min, max } = PricingService.estimatePrice(100)
    assert.equal((min * 2) % 1, 0, 'min not rounded to 0.50')
    assert.equal((max * 2) % 1, 0, 'max not rounded to 0.50')
  })
})

test.group('PricingService.validatePriceInRange', () => {
  test('accepts price within range', ({ assert }) => {
    assert.isTrue(PricingService.validatePriceInRange(10, 8, 15))
  })

  test('accepts price equal to min', ({ assert }) => {
    assert.isTrue(PricingService.validatePriceInRange(8, 8, 15))
  })

  test('accepts price equal to max', ({ assert }) => {
    assert.isTrue(PricingService.validatePriceInRange(15, 8, 15))
  })

  test('rejects price below min', ({ assert }) => {
    assert.isFalse(PricingService.validatePriceInRange(7, 8, 15))
  })

  test('rejects price above max', ({ assert }) => {
    assert.isFalse(PricingService.validatePriceInRange(16, 8, 15))
  })
})

test.group('PricingService.calculateCommission', () => {
  test('applies 10% commission and rounds to 2 decimal places', ({ assert }) => {
    assert.equal(PricingService.calculateCommission(20), 2)
    assert.equal(PricingService.calculateCommission(15.5), 1.55)
  })

  test('commission on zero is zero', ({ assert }) => {
    assert.equal(PricingService.calculateCommission(0), 0)
  })
})
