import PolicyLens from '@/components/policy-lens'
import LiquidEther from '@/components/ui/LiquidEther'

export const metadata = {
  title: 'ClaimLens — Policy-to-Patient: Insurance Coverage & Treatment Cost Intelligence',
  description:
    'Before planned hospitalization, ClaimLens converts health insurance policies into auditable coverage rules, applies them to patient scenarios, and explains patient share with Clause-to-Rupee traceability.',
}

export default function Page() {
  return (
    <>
      <div className="fixed inset-0 z-0 pointer-events-none opacity-80">
        <LiquidEther
          colors={['#129f8c', '#35d69c', '#61a08c']}
          backgroundColor="#080e14"
          lightMode={false}
          mouseForce={25}
          cursorSize={120}
          isViscous={true}
          viscous={30}
          autoDemo={true}
        />
      </div>
      <div className="relative z-10 w-full h-full">
        <PolicyLens />
      </div>
    </>
  )
}

