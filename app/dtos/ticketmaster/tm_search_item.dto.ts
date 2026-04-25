export interface TmSearchItemDto {
  id: number
  title: string
  startDate: string
  endDate: string
  city: string
  cityId: number
  place: string
  urlImage: string
  price: number
  genre: string
  status: string
}

export interface TmSearchResponseDto {
  content: TmSearchItemDto[]
  totalElements: number
  totalPages: number
  number: number
  size: number
  last: boolean
  first: boolean
  empty: boolean
}
