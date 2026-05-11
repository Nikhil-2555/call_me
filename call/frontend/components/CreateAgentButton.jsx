"use client";

import { useRouter } from "next/navigation";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CreateAgentButton() {
  const router = useRouter();

  return (
    <Button
      onClick={() => router.push("/create-agent")}
      className="flex  cursor-pointer items-center gap-2"
    >
      <Bot className="w-4 h-4" />
      Create Agent
    </Button>
  );
}