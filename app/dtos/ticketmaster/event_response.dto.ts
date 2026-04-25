export interface EventResponseDto {
  id: string
  name: string
  venueName: string
  venueAddress: string | null
  city: string
  country: string | null
  latitude: number | null
  longitude: number | null
  startsAt: string
  imageUrl: string | null
  genre: string | null
  url: string | null
  ridesCount: number
  hasActiveAlert: boolean | null
}

export interface EventListResponseDto {
  data: EventResponseDto[]
  meta: {
    total: number
    page: number
    limit: number
  }
}
