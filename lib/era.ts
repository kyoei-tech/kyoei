// Japanese era (元号) conversion for years used across the app's calendars.
const ERAS = [
  { name: '令和', startYear: 2019 },
  { name: '平成', startYear: 1989 },
  { name: '昭和', startYear: 1926 },
] as const

export function eraLabel(westernYear: number): string {
  for (const era of ERAS) {
    if (westernYear >= era.startYear) {
      const eraYear = westernYear - era.startYear + 1
      return eraYear === 1 ? `${era.name}元年` : `${era.name}${eraYear}年`
    }
  }
  return `${westernYear}年`
}
