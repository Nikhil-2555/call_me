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
  return (
    <div className="grid grid-cols-1 gap-4 px-4 md:grid-cols-4 lg:px-6">
      <Card className="bg-gradient-to-t shadow-xs">
        <CardHeader>
          <CardDescription>Number of calls</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums">
            1
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconCheck className="h-6 w-6" />
            </Badge>
          </CardAction>
        </CardHeader>
      </Card>
      <Card className="bg-gradient-to-t shadow-xs">
        <CardHeader>
          <CardDescription>Average duration</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums">
            5:01
          </CardTitle>
        </CardHeader>
      </Card>
      <Card className="bg-gradient-to-t shadow-xs">
        <CardHeader>
          <CardDescription>Total cost</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums">
            1,686 credits
          </CardTitle>
        </CardHeader>
      </Card>
      <Card className="bg-gradient-to-t shadow-xs">
        <CardHeader>
          <CardDescription>Average cost</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums">
            1,686 credits/call
          </CardTitle>
        </CardHeader>
      </Card>
    </div>
  );
}