import { test } from '@japa/runner'
import {
  getClosestCity,
  getCitiesInRadius,
  getCityByCityId,
  getCoordByUrl,
} from '#utils/tm_utils'

test.group('getCoordByUrl', () => {
  test('returns coords for known city slug', ({ assert }) => {
    const coord = getCoordByUrl('paris')
    assert.isNotNull(coord)
    assert.equal(coord!.city, 'Paris')
    assert.approximately(coord!.lat, 48.87, 0.1)
    assert.approximately(coord!.lng, 2.33, 0.1)
  })

  test('returns undefined for unknown slug', ({ assert }) => {
    assert.isUndefined(getCoordByUrl('atlantis'))
  })
})

test.group('getCityByCityId', () => {
  test('finds Paris by a known city ID', ({ assert }) => {
    // Paris has idRattachement in the villes dataset; check a city we know has ID 55354
    const city = getCityByCityId(55354)
    assert.isDefined(city)
    assert.equal(city!.slug, 'lyon')
  })

  test('returns undefined for unknown city ID', ({ assert }) => {
    assert.isUndefined(getCityByCityId(999999999))
  })
})

test.group('getClosestCity', () => {
  test('returns Lyon for coords near Lyon', ({ assert }) => {
    // Lyon coords: 45.75, 4.85
    const city = getClosestCity(45.74, 4.83)
    assert.isDefined(city)
    assert.equal(city!.slug, 'lyon')
  })

  test('returns undefined when radius is too small', ({ assert }) => {
    // Middle of the ocean — no city within 1km
    const city = getClosestCity(40.0, -30.0, 1)
    assert.isUndefined(city)
  })

  test('respects maxRadiusKm parameter', ({ assert }) => {
    // Paris coords — asking only within 10km should find Paris but not Lyon
    const city = getClosestCity(48.866, 2.333, 10)
    assert.isDefined(city)
    assert.equal(city!.slug, 'paris')
  })
})

test.group('getCitiesInRadius', () => {
  test('returns empty array when no city in range', ({ assert }) => {
    const cities = getCitiesInRadius(40.0, -30.0, 5)
    assert.isEmpty(cities)
  })

  test('returns Paris for coords at Paris center within 5km', ({ assert }) => {
    const cities = getCitiesInRadius(48.866, 2.333, 5)
    const slugs = cities.map((c) => c.slug)
    assert.include(slugs, 'paris')
  })

  test('wider radius returns more cities', ({ assert }) => {
    const narrow = getCitiesInRadius(47.0, 2.5, 50)
    const wide = getCitiesInRadius(47.0, 2.5, 300)
    assert.isAtLeast(wide.length, narrow.length)
  })

  test('returned cities all have cityIds array', ({ assert }) => {
    const cities = getCitiesInRadius(48.866, 2.333, 100)
    for (const city of cities) {
      assert.isArray(city.cityIds)
      assert.isNotEmpty(city.cityIds)
    }
  })
})
