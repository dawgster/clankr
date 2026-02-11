export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Override the app layout — no sidebar for onboarding
  return <div className="min-h-screen">{children}</div>;
}
