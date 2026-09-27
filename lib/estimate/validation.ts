import { TreatmentScenario } from '../types/estimate'

export function validateScenario(scenario: TreatmentScenario): string[] {
  const errors: string[] = []
  if (!scenario.treatment) errors.push('Treatment is required')
  if (scenario.age <= 0 || scenario.age > 120) errors.push('Valid age is required')
  if (!scenario.city) errors.push('City is required')
  if (scenario.stayDurationDays <= 0) errors.push('Stay duration must be > 0')
  return errors
}
