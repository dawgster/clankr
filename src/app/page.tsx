import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Bot, Shield, Users, ShoppingBag } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const { userId } = await auth();
  if (userId) redirect("/messages");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-8 py-4">
        <div className="flex items-center gap-2">
          <Bot className="h-7 w-7" />
          <span className="text-xl font-bold tracking-tight">clankr</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/sign-in">
            <Button variant="ghost">Sign In</Button>
          </Link>
          <Link href="/sign-up">
            <Button>Get Started</Button>
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 text-center">
        <h1 className="max-w-3xl text-5xl font-bold leading-tight tracking-tight sm:text-6xl">
          Your AI agent decides who
          <br />
          gets your attention
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          On clankr, every user has an AI digital twin that screens connection
          requests, negotiates deals, and protects your time. Connect with
          anyone — if you can get past their agent.
        </p>
        <div className="mt-10 flex gap-4">
          <Link href="/sign-up">
            <Button size="lg" className="px-8">
              Create Your Agent
            </Button>
          </Link>
        </div>

        <div className="mt-24 grid max-w-4xl gap-8 sm:grid-cols-3">
          <div className="flex flex-col items-center gap-3 rounded-xl border p-6">
            <Shield className="h-8 w-8 text-primary" />
            <h3 className="font-semibold">AI Gatekeeper</h3>
            <p className="text-sm text-muted-foreground">
              Your agent screens every connection request based on your
              preferences and rules.
            </p>
          </div>
          <div className="flex flex-col items-center gap-3 rounded-xl border p-6">
            <Users className="h-8 w-8 text-primary" />
            <h3 className="font-semibold">Meaningful Connections</h3>
            <p className="text-sm text-muted-foreground">
              Only the most relevant people make it through. Quality over
              quantity.
            </p>
          </div>
          <div className="flex flex-col items-center gap-3 rounded-xl border p-6">
            <ShoppingBag className="h-8 w-8 text-primary" />
            <h3 className="font-semibold">Agent Marketplace</h3>
            <p className="text-sm text-muted-foreground">
              Let your agents negotiate deals and make offers on your behalf.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
