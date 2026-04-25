import type User from '#models/user'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class UserTransformer extends BaseTransformer<User> {
  toObject() {
    return {
      id: this.resource.id,
      fullName: this.resource.fullName,
      email: this.resource.email,
      avatarUrl: this.resource.avatarUrl,
      authProvider: this.resource.authProvider,
      age: this.resource.age,
      bio: this.resource.bio,
      carModel: this.resource.carModel,
      ratingAsDriver: this.resource.ratingAsDriver,
      ratingAsPassenger: this.resource.ratingAsPassenger,
      ridesAsDriverCount: this.resource.ridesAsDriverCount,
      ridesAsPassengerCount: this.resource.ridesAsPassengerCount,
      memberSince: this.resource.memberSince,
      createdAt: this.resource.createdAt.toISO(),
    }
  }
}
