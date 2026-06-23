"use client";
import React, { useEffect, useState } from "react";
import axios from "axios";
import { IconCheck } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardAction,
  CardTitle,
} from "@/components/ui/card";

export function SectionCards() {
  const [stats, setStats] = useState({
    totalCalls: "...",
    avgDuration: "...",
    totalCost: "...",
    avgCost: "...",
  });

  useEffect(() => {
    axios.get("http://localhost:8000/conversations")
      .then(({ data }) => {
        const calls = data.length;
        if (calls === 0) {
          setStats({ totalCalls: "0", avgDuration: "0:00", totalCost: "0 credits", avgCost: "0 credits/call" });
          return;
        }

        let totalSeconds = 0;
        let totalCredits = 0;

        data.forEach((c: { duration?: string; creditsCall?: number }) => {
          if (c.duration) {
            const parts = String(c.duration).split(":");
            if (parts.length === 2) {
              totalSeconds += parseInt(parts[0]) * 60 + parseInt(parts[1]);
            }
          }
          totalCredits += c.creditsCall || 0;
        });

        const avgSecs = Math.floor(totalSeconds / calls);
        const m = Math.floor(avgSecs / 60);
        const s = String(avgSecs % 60).padStart(2, "0");

        setStats({
          totalCalls: calls.toString(),
          avgDuration: `${m}:${s}`,
          totalCost: `${totalCredits.toLocaleString()} credits`,
          avgCost: `${Math.floor(totalCredits / calls).toLocaleString()} credits/call`
        });
      })
      .catch(console.error);
  }, []);

  return (
    <div className="grid grid-cols-1 gap-4 px-4 md:grid-cols-4 lg:px-6">
      <Card className="bg-gradient-to-t shadow-xs">
        <CardHeader>
          <CardDescription>Number of calls</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums">
            {stats.totalCalls}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconCheck className="h-4 w-4" />
            </Badge>
          </CardAction>
        </CardHeader>
      </Card>
      <Card className="bg-gradient-to-t shadow-xs">
        <CardHeader>
          <CardDescription>Average duration</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums">
            {stats.avgDuration}
          </CardTitle>
        </CardHeader>
      </Card>
      <Card className="bg-gradient-to-t shadow-xs">
        <CardHeader>
          <CardDescription>Total cost</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums">
            {stats.totalCost}
          </CardTitle>
        </CardHeader>
      </Card>
      <Card className="bg-gradient-to-t shadow-xs">
        <CardHeader>
          <CardDescription>Average cost</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums">
            {stats.avgCost}
          </CardTitle>
        </CardHeader>
      </Card>
    </div>
  );
}