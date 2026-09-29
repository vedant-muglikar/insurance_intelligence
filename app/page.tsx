import PolicyLens from '@/components/policy-lens'
import LiquidEther from '@/components/ui/LiquidEther'

export default function Page() {
  return (
    <>
      <div className="fixed inset-0 z-0">
        <LiquidEther
          colors={['#129f8c', '#35d69c', '#61a08c']}
          backgroundColor="#e8eeec"
          lightMode={true}
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
